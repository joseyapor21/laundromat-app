import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Machine from '@/lib/db/models/Machine';
import Order from '@/lib/db/models/Order';
import ActivityLog from '@/lib/db/models/ActivityLog';
import { getCurrentUser } from '@/lib/auth/server';

// POST /api/machines/unload - Mark dryer as unloaded (clothes taken out)
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const user = await getCurrentUser();

    const { orderId, machineId, initials } = body;

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

    // Find the machine assignment (convert both to string for comparison)
    const assignmentIndex = order.machineAssignments?.findIndex(
      (a: { machineId: string; removedAt?: Date; machineType: string }) =>
        a.machineId?.toString() === machineId?.toString() && !a.removedAt && a.machineType === 'dryer'
    );

    if (assignmentIndex === undefined || assignmentIndex === -1) {
      return NextResponse.json(
        { error: 'Active dryer assignment not found' },
        { status: 404 }
      );
    }

    const assignment = order.machineAssignments![assignmentIndex];

    // Check if already unloaded
    if (assignment.unloadedAt) {
      return NextResponse.json(
        { error: 'This dryer has already been marked as unloaded' },
        { status: 400 }
      );
    }

    // Mark as unloaded
    assignment.unloadedAt = new Date();
    assignment.unloadedBy = user?.name || 'Unknown';
    assignment.unloadedByInitials = initials || user?.name?.split(' ').map((n: string) => n[0]).join('') || '';

    await order.save();

    // Log activity
    await ActivityLog.create({
      locationId: user?.locationId,
      userId: user?.userId || 'system',
      userName: user?.name || 'System',
      action: 'dryer_unload',
      entityType: 'order',
      entityId: orderId,
      details: `Order #${order.orderId} - ${assignment.machineName} unloaded by ${assignment.unloadedBy}`,
      metadata: {
        orderId: order.orderId,
        machineId,
        machineName: assignment.machineName,
        unloadedBy: assignment.unloadedBy,
      },
      timestamp: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `${assignment.machineName} marked as unloaded`,
      order,
    });
  } catch (error) {
    console.error('Failed to mark dryer as unloaded:', error);
    return NextResponse.json({ error: 'Failed to mark dryer as unloaded' }, { status: 500 });
  }
}
