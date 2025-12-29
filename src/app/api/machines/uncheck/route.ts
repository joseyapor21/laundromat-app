import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

// POST /api/machines/uncheck - Remove check from a machine assignment
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

    const { orderId, machineId } = await request.json();

    if (!orderId || !machineId) {
      return NextResponse.json(
        { error: 'Order ID and Machine ID are required' },
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
        a.machineId === machineId && !a.removedAt && a.isChecked
    );

    if (assignmentIndex === undefined || assignmentIndex === -1) {
      return NextResponse.json(
        { error: 'Checked machine assignment not found' },
        { status: 404 }
      );
    }

    const assignment = order.machineAssignments![assignmentIndex];

    // Remove the check - use toObject() to get plain object
    const assignmentData = typeof assignment.toObject === 'function'
      ? assignment.toObject()
      : { ...assignment };

    order.machineAssignments![assignmentIndex] = {
      ...assignmentData,
      isChecked: false,
      checkedAt: undefined,
      checkedBy: undefined,
      checkedByInitials: undefined,
    };

    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'uncheck_machine',
        entityType: 'machine',
        entityId: machineId,
        details: `Unchecked ${assignment.machineType} "${assignment.machineName}" for order #${order.orderId}`,
        metadata: {
          orderId: order._id.toString(),
          orderNumber: order.orderId,
          machineId,
          machineName: assignment.machineName,
          machineType: assignment.machineType,
          previousChecker: assignment.checkedBy,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `${assignment.machineType === 'washer' ? 'Washer' : 'Dryer'} "${assignment.machineName}" unchecked`,
    });
  } catch (error) {
    console.error('Uncheck machine error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
