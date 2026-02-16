import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Machine from '@/lib/db/models/Machine';
import Order from '@/lib/db/models/Order';
import ActivityLog from '@/lib/db/models/ActivityLog';
import { getCurrentUser } from '@/lib/auth/server';

// POST /api/machines/scan - Assign order to machine via QR code
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const user = await getCurrentUser();

    const { qrCode, orderId } = body;

    console.log('Scan request:', { qrCode, orderId, user: user?.name, locationId: user?.locationId });

    if (!qrCode || !orderId) {
      console.log('Scan error: Missing qrCode or orderId');
      return NextResponse.json(
        { error: 'QR code and order ID are required' },
        { status: 400 }
      );
    }

    // Find machine by QR code, filtered by location if user has one
    const machineQuery: { qrCode: string; locationId?: string } = { qrCode };
    if (user?.locationId) {
      machineQuery.locationId = user.locationId;
    }
    const machine = await Machine.findOne(machineQuery);
    if (!machine) {
      console.log('Scan error: Machine not found for QR code:', qrCode);
      return NextResponse.json(
        { error: 'Machine not found with this QR code' },
        { status: 404 }
      );
    }

    // Check if machine is in maintenance
    if (machine.status === 'maintenance') {
      console.log('Scan error: Machine in maintenance:', machine.name);
      return NextResponse.json(
        { error: `${machine.name} is under maintenance` },
        { status: 400 }
      );
    }

    // Check if machine is already in use by another order
    // First check via machine status
    const currentMachineOrderId = machine.currentOrderId?.toString();
    console.log('Machine status check:', {
      machineName: machine.name,
      status: machine.status,
      currentOrderId: currentMachineOrderId,
      requestedOrderId: orderId
    });

    if (machine.status === 'in_use' && currentMachineOrderId && currentMachineOrderId !== orderId) {
      const currentOrder = await Order.findById(machine.currentOrderId);
      const orderInfo = currentOrder ? `Order #${currentOrder.orderId} (${currentOrder.customerName})` : 'another order';
      console.log('Scan error: Machine already in use (via status):', machine.name, 'by', orderInfo);
      return NextResponse.json(
        { error: `${machine.name} is already in use by ${orderInfo}` },
        { status: 400 }
      );
    }

    // Also check by looking at active machine assignments in orders (backup check)
    // Filter by location to avoid cross-location conflicts
    // Exclude assignments that are checked (isChecked: true) since the machine was released
    const orderCheckQuery: {
      _id: { $ne: string };
      machineAssignments: { $elemMatch: { machineId: string; removedAt: { $exists: boolean }; isChecked: { $ne: boolean } } };
      locationId?: string;
    } = {
      _id: { $ne: orderId },
      'machineAssignments': {
        $elemMatch: {
          machineId: machine._id.toString(),
          removedAt: { $exists: false },
          isChecked: { $ne: true }
        }
      }
    };
    if (user?.locationId) {
      orderCheckQuery.locationId = user.locationId;
    }
    const orderWithMachine = await Order.findOne(orderCheckQuery);

    if (orderWithMachine) {
      const orderInfo = `Order #${orderWithMachine.orderId} (${orderWithMachine.customerName})`;
      console.log('Scan error: Machine already in use (via order check):', machine.name, 'by', orderInfo);

      // Also fix the machine status since it's out of sync
      await Machine.findByIdAndUpdate(machine._id, {
        status: 'in_use',
        currentOrderId: orderWithMachine._id.toString(),
      });

      return NextResponse.json(
        { error: `${machine.name} is already in use by ${orderInfo}` },
        { status: 400 }
      );
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('Scan error: Order not found:', orderId);
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if this machine is already assigned to this order
    const machineAssignments = order.machineAssignments || [];
    const existingAssignment = machineAssignments.find(
      (a: { machineId: string; removedAt?: Date }) =>
        a.machineId === machine._id.toString() && !a.removedAt
    );

    if (existingAssignment) {
      console.log('Scan error: Already assigned:', machine.name);
      return NextResponse.json(
        { error: `Order is already assigned to ${machine.name}` },
        { status: 400 }
      );
    }

    // Add machine assignment to order
    const assignment = {
      machineId: machine._id.toString(),
      machineName: machine.name,
      machineType: machine.type,
      assignedAt: new Date(),
      assignedBy: user?.name || 'System',
    };

    // Initialize machineAssignments array if it doesn't exist, then push
    const updateResult = await Order.findByIdAndUpdate(
      orderId,
      {
        $push: { machineAssignments: assignment },
      },
      { new: true }
    );

    console.log('Machine assignment added:', {
      orderId,
      assignment,
      machineAssignments: updateResult?.machineAssignments,
    });

    // Update machine status
    await Machine.findByIdAndUpdate(machine._id, {
      status: 'in_use',
      currentOrderId: orderId,
      lastUsedAt: new Date(),
    });

    // Determine the new order status based on machine type
    let newStatus = order.status;
    if (machine.type === 'washer' && order.status !== 'in_washer') {
      newStatus = 'in_washer';
    } else if (machine.type === 'dryer' && order.status !== 'in_dryer') {
      // Allow dryer assignment from any status (preferably transfer_checked or transferred)
      newStatus = 'in_dryer';
    }

    // Update order status if changed
    if (newStatus !== order.status) {
      await Order.findByIdAndUpdate(orderId, {
        status: newStatus,
        $push: {
          statusHistory: {
            status: newStatus,
            changedBy: user?.name || 'system',
            changedAt: new Date(),
            notes: `Assigned to ${machine.name}`,
          },
        },
      });
    }

    // Log activity
    await ActivityLog.create({
      locationId: user?.locationId,
      userId: user?.userId || 'system',
      userName: user?.name || 'System',
      action: machine.type === 'washer' ? 'assign_washer' : 'assign_dryer',
      entityType: 'order',
      entityId: orderId,
      details: `Order #${order.orderId} assigned to ${machine.name} (${machine.type})`,
      metadata: {
        orderId: order.orderId,
        machineId: machine._id.toString(),
        machineName: machine.name,
        machineType: machine.type,
        customerName: order.customerName,
      },
      timestamp: new Date(),
    });

    // Fetch updated order
    const updatedOrder = await Order.findById(orderId);

    return NextResponse.json({
      message: `Order assigned to ${machine.name}`,
      machine: {
        _id: machine._id,
        name: machine.name,
        type: machine.type,
      },
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Failed to scan machine:', error);
    return NextResponse.json({ error: 'Failed to process scan' }, { status: 500 });
  }
}
