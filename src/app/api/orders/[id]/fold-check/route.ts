import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { notifyOrderStatusChange } from '@/lib/services/pushNotifications';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Verify/check folding and move to ready status
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();
    const { id } = await params;
    const { checkedBy, checkedByInitials } = await request.json();

    if (!checkedBy) {
      return NextResponse.json(
        { error: 'Checker name is required' },
        { status: 400 }
      );
    }

    // Find the order
    let order = await Order.findById(id);

    if (!order) {
      order = await Order.findOne({ id });
    }

    if (!order) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        order = await Order.findOne({ orderId: numericId });
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Ensure order is in folded status
    if (order.status !== 'folded') {
      return NextResponse.json(
        { error: 'Order must be in folded status to verify' },
        { status: 400 }
      );
    }

    // Prevent same person from folding and checking
    if (order.foldedBy && checkedBy &&
        order.foldedBy.toLowerCase() === checkedBy.toLowerCase()) {
      return NextResponse.json(
        { error: 'The same person who marked the order as folded cannot verify it. A different person must check.' },
        { status: 400 }
      );
    }

    // Update folding check info
    order.foldingCheckedBy = checkedBy;
    order.foldingCheckedByInitials = checkedByInitials || '';
    order.foldingCheckedAt = new Date();

    // Determine next status based on order type
    const nextStatus = order.orderType === 'delivery'
      ? 'ready_for_delivery'
      : 'ready_for_pickup';

    order.status = nextStatus;

    // Add to status history
    order.statusHistory.push({
      status: nextStatus,
      changedBy: currentUser.name,
      changedAt: new Date(),
      notes: `Folding verified by ${checkedBy}, moved to ${nextStatus === 'ready_for_delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}`,
    });

    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'status_change',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Order #${order.orderId} folding verified by ${checkedBy}, status changed to ${nextStatus}`,
        metadata: {
          orderId: order.orderId,
          checkedBy,
          checkedByInitials,
          previousStatus: 'folded',
          newStatus: nextStatus,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Send push notification to clocked-in staff at this location
    notifyOrderStatusChange(
      order._id.toString(),
      order.orderId,
      order.customerName,
      nextStatus,
      { excludeUserId: currentUser.userId, locationId: order.locationId?.toString() }
    ).catch(err => console.error('Push notification error:', err));

    return NextResponse.json({
      success: true,
      message: `Folding verified, order moved to ${nextStatus === 'ready_for_delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}`,
      order,
    });
  } catch (error) {
    console.error('Folding check error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
