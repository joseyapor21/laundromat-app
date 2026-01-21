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

    // Log the data we're working with
    console.log('Release request:', { machineId, orderId, machineName: machine.name });
    console.log('Order machineAssignments:', JSON.stringify(order.machineAssignments, null, 2));

    // Mark assignment as removed - use $elemMatch to ensure both conditions on same element
    let updatedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        machineAssignments: {
          $elemMatch: {
            machineId: machineId,
            removedAt: { $exists: false }
          }
        }
      },
      {
        $set: {
          'machineAssignments.$.removedAt': new Date(),
          'machineAssignments.$.removedBy': user?.name || 'System',
        },
      },
      { new: true }
    );

    // If not found, try with machineId as string comparison
    if (!updatedOrder) {
      console.log('First query failed, trying string comparison...');
      updatedOrder = await Order.findOneAndUpdate(
        {
          _id: orderId,
          machineAssignments: {
            $elemMatch: {
              machineId: machine._id.toString(),
              removedAt: { $exists: false }
            }
          }
        },
        {
          $set: {
            'machineAssignments.$.removedAt': new Date(),
            'machineAssignments.$.removedBy': user?.name || 'System',
          },
        },
        { new: true }
      );
    }

    // Try matching by machineName if machineId doesn't work
    if (!updatedOrder) {
      console.log('MachineId query failed, trying by machineName...');
      updatedOrder = await Order.findOneAndUpdate(
        {
          _id: orderId,
          machineAssignments: {
            $elemMatch: {
              machineName: machine.name,
              removedAt: { $exists: false }
            }
          }
        },
        {
          $set: {
            'machineAssignments.$.removedAt': new Date(),
            'machineAssignments.$.removedBy': user?.name || 'System',
          },
        },
        { new: true }
      );
    }

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

    // Always release the machine, even if assignment wasn't found in order
    // (handles cases where data is out of sync)
    await Machine.findByIdAndUpdate(machineId, {
      status: 'available',
      currentOrderId: null,
    });

    if (!updatedOrder) {
      console.log('Assignment not found in order, but machine was released');
      // Still return success since machine is now available
      return NextResponse.json({
        message: `${machine.name} has been released`,
        warning: 'Assignment record was not found in order, but machine is now available',
      });
    }

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
