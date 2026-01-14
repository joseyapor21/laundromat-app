import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog, Machine } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { notifyMachineChecked } from '@/lib/services/pushNotifications';

// POST /api/machines/check - Mark a machine assignment as checked
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const body = await request.json();
    const { orderId, machineId, checkerInitials } = body;

    console.log('Check machine request:', { orderId, machineId, checkerInitials, body });

    if (!orderId || !machineId) {
      console.log('Check machine error: Missing orderId or machineId', { orderId, machineId });
      return NextResponse.json(
        { error: 'Order ID and Machine ID are required' },
        { status: 400 }
      );
    }

    if (!checkerInitials || checkerInitials.trim().length < 2) {
      return NextResponse.json(
        { error: 'Checker initials are required (at least 2 characters)' },
        { status: 400 }
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

    // Find the specific machine assignment
    const assignmentIndex = order.machineAssignments?.findIndex(
      (a: { machineId: string; removedAt?: Date; isChecked?: boolean }) =>
        a.machineId === machineId && !a.removedAt && !a.isChecked
    );

    if (assignmentIndex === undefined || assignmentIndex === -1) {
      return NextResponse.json(
        { error: 'Active machine assignment not found or already checked' },
        { status: 404 }
      );
    }

    const assignment = order.machineAssignments![assignmentIndex];

    // VALIDATION: Checker cannot be the same person who assigned
    if (assignment.assignedBy === currentUser.name) {
      return NextResponse.json(
        { error: 'You cannot check your own assignment. Another person must verify.' },
        { status: 403 }
      );
    }

    // Update the assignment with checker info - use toObject() to get plain object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignmentData = typeof (assignment as any).toObject === 'function'
      ? (assignment as any).toObject()
      : { ...assignment };

    order.machineAssignments![assignmentIndex] = {
      ...assignmentData,
      isChecked: true,
      checkedAt: new Date(),
      checkedBy: currentUser.name,
      checkedByInitials: checkerInitials.trim().toUpperCase(),
    };

    await order.save();

    // Release the machine - set status to available and clear currentOrderId
    await Machine.findByIdAndUpdate(machineId, {
      status: 'available',
      currentOrderId: null,
      lastUsedAt: new Date(),
    });

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'release_machine',
        entityType: 'machine',
        entityId: machineId,
        details: `Checked ${assignment.machineType} "${assignment.machineName}" for order #${order.orderId} (Initials: ${checkerInitials.trim().toUpperCase()})`,
        metadata: {
          orderId: order._id.toString(),
          orderNumber: order.orderId,
          machineId,
          machineName: assignment.machineName,
          machineType: assignment.machineType,
          checkerInitials: checkerInitials.trim().toUpperCase(),
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Send push notification about machine check
    notifyMachineChecked(
      order._id.toString(),
      order.orderId,
      assignment.machineName,
      checkerInitials.trim().toUpperCase(),
      currentUser.userId
    ).catch(err => console.error('Push notification error:', err));

    return NextResponse.json({
      success: true,
      message: `${assignment.machineType === 'washer' ? 'Washer' : 'Dryer'} "${assignment.machineName}" checked by ${checkerInitials.trim().toUpperCase()}`,
      assignment: order.machineAssignments![assignmentIndex],
    });
  } catch (error) {
    console.error('Check machine error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
