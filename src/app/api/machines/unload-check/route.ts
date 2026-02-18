import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Order from '@/lib/db/models/Order';
import ActivityLog from '@/lib/db/models/ActivityLog';
import { getCurrentUser } from '@/lib/auth/server';

// POST /api/machines/unload-check - Verify dryer unloading was done correctly
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const user = await getCurrentUser();

    const { orderId, machineId, initials, forceSamePerson } = body;

    if (!orderId || !machineId) {
      return NextResponse.json(
        { error: 'Order ID and machine ID are required' },
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

    // Find the machine assignment
    const assignmentIndex = order.machineAssignments?.findIndex(
      (a: { machineId: string; removedAt?: Date; machineType: string }) =>
        a.machineId === machineId && !a.removedAt && a.machineType === 'dryer'
    );

    if (assignmentIndex === undefined || assignmentIndex === -1) {
      return NextResponse.json(
        { error: 'Active dryer assignment not found' },
        { status: 404 }
      );
    }

    const assignment = order.machineAssignments![assignmentIndex];

    // Must be unloaded first
    if (!assignment.unloadedAt) {
      return NextResponse.json(
        { error: 'This dryer must be marked as unloaded first' },
        { status: 400 }
      );
    }

    // Check if already verified
    if (assignment.isUnloadChecked) {
      return NextResponse.json(
        { error: 'This dryer unload has already been verified' },
        { status: 400 }
      );
    }

    // Check if same person is trying to verify (should be different person)
    const checkerInitials = initials || user?.name?.split(' ').map((n: string) => n[0]).join('') || '';
    if (!forceSamePerson && assignment.unloadedByInitials === checkerInitials) {
      return NextResponse.json(
        {
          error: 'Same person cannot verify their own unload',
          requireConfirmation: true
        },
        { status: 400 }
      );
    }

    // Mark as verified
    assignment.isUnloadChecked = true;
    assignment.unloadCheckedAt = new Date();
    assignment.unloadCheckedBy = user?.name || 'Unknown';
    assignment.unloadCheckedByInitials = checkerInitials;

    await order.save();

    // Log activity
    await ActivityLog.create({
      locationId: user?.locationId,
      userId: user?.userId || 'system',
      userName: user?.name || 'System',
      action: 'dryer_unload_check',
      entityType: 'order',
      entityId: orderId,
      details: `Order #${order.orderId} - ${assignment.machineName} unload verified by ${assignment.unloadCheckedBy}`,
      metadata: {
        orderId: order.orderId,
        machineId,
        machineName: assignment.machineName,
        unloadedBy: assignment.unloadedBy,
        checkedBy: assignment.unloadCheckedBy,
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `${assignment.machineName} unload verified`,
      order,
    });
  } catch (error) {
    console.error('Failed to verify dryer unload:', error);
    return NextResponse.json({ error: 'Failed to verify dryer unload' }, { status: 500 });
  }
}
