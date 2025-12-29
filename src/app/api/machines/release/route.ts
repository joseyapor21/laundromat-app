import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Machine from '@/lib/db/models/Machine';
import Order from '@/lib/db/models/Order';
import ActivityLog from '@/lib/db/models/ActivityLog';
import { getCurrentUser } from '@/lib/auth/server';

// POST /api/machines/release - Remove order from machine
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const user = await getCurrentUser();

    const { machineId, orderId } = body;

    if (!machineId || !orderId) {
      return NextResponse.json(
        { error: 'Machine ID and order ID are required' },
        { status: 400 }
      );
    }

    // Find the machine
    const machine = await Machine.findById(machineId);
    if (!machine) {
      return NextResponse.json(
        { error: 'Machine not found' },
        { status: 404 }
      );
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Mark assignment as removed - try by machineId first, then by _id for corrupted data
    let updatedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        'machineAssignments.machineId': machineId,
        'machineAssignments.removedAt': { $exists: false },
      },
      {
        $set: {
          'machineAssignments.$.removedAt': new Date(),
          'machineAssignments.$.removedBy': user?.name || 'System',
        },
      },
      { new: true }
    );

    // If not found by machineId, try to find corrupted assignment without machineId
    if (!updatedOrder) {
      // Check if there's a corrupted assignment (has _id but no machineId)
      const orderWithCorrupted = await Order.findOne({
        _id: orderId,
        'machineAssignments': {
          $elemMatch: {
            machineId: { $exists: false },
            removedAt: { $exists: false },
          },
        },
      });

      if (orderWithCorrupted) {
        // Pull the corrupted assignment entirely
        updatedOrder = await Order.findByIdAndUpdate(
          orderId,
          {
            $pull: {
              machineAssignments: {
                machineId: { $exists: false },
              },
            },
          },
          { new: true }
        );
      }
    }

    if (!updatedOrder) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      );
    }

    // Update machine status to available
    await Machine.findByIdAndUpdate(machineId, {
      status: 'available',
      currentOrderId: null,
    });

    // Log activity
    await ActivityLog.create({
      userId: user?.userId || 'system',
      userName: user?.name || 'System',
      action: 'release_machine',
      entityType: 'order',
      entityId: orderId,
      details: `Order #${order.orderId} removed from ${machine.name} (${machine.type})`,
      metadata: {
        orderId: order.orderId,
        machineId: machine._id.toString(),
        machineName: machine.name,
        machineType: machine.type,
        customerName: order.customerName,
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      message: `Order removed from ${machine.name}`,
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Failed to release machine:', error);
    return NextResponse.json({ error: 'Failed to release machine' }, { status: 500 });
  }
}
