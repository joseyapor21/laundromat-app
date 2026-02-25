import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Order from '@/lib/db/models/Order';
import ActivityLog from '@/lib/db/models/ActivityLog';
import { getCurrentUser } from '@/lib/auth/server';

// POST /api/machines/folded - Mark dryer clothes as folded
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const user = await getCurrentUser();

    const { orderId, machineId, initials } = body;

    console.log('Mark dryer folded request:', { orderId, machineId, initials });

    if (!orderId || !machineId) {
      return NextResponse.json(
        { error: 'Order ID and machine ID are required' },
        { status: 400 }
      );
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('Order not found:', orderId);
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Find the machine assignment (convert both to string for comparison)
    const assignmentIndex = order.machineAssignments?.findIndex(
      (a: { machineId: string; removedAt?: Date; machineType: string }) =>
        a.machineId?.toString() === machineId?.toString() && !a.removedAt && a.machineType === 'dryer'
    );

    console.log('Looking for machineId:', machineId, 'Found at index:', assignmentIndex);

    if (assignmentIndex === undefined || assignmentIndex === -1) {
      return NextResponse.json(
        { error: 'Active dryer assignment not found' },
        { status: 404 }
      );
    }

    const assignment = order.machineAssignments![assignmentIndex];

    // Check if folding has started
    if (!assignment.isFolding) {
      return NextResponse.json(
        { error: 'Folding must be started before marking as folded' },
        { status: 400 }
      );
    }

    // Check if already folded
    if (assignment.isFolded) {
      return NextResponse.json(
        { error: 'This dryer has already been marked as folded' },
        { status: 400 }
      );
    }

    // Mark as folded
    assignment.isFolded = true;
    assignment.foldedAt = new Date();
    assignment.foldedBy = user?.name || 'Unknown';
    assignment.foldedByInitials = initials || user?.name?.split(' ').map((n: string) => n[0]).join('') || '';

    await order.save();

    // Log activity
    await ActivityLog.create({
      locationId: user?.locationId,
      userId: user?.userId || 'system',
      userName: user?.name || 'System',
      action: 'dryer_folded',
      entityType: 'order',
      entityId: orderId,
      details: `Order #${order.orderId} - Finished folding ${assignment.machineName} by ${assignment.foldedBy}`,
      metadata: {
        orderId: order.orderId,
        machineId,
        machineName: assignment.machineName,
        foldedBy: assignment.foldedBy,
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Finished folding ${assignment.machineName}`,
      order,
    });
  } catch (error) {
    console.error('Failed to mark dryer as folded:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to mark as folded: ${errorMessage}` }, { status: 500 });
  }
}
