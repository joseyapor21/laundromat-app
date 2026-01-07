import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { notifyOrderStatusChange } from '@/lib/services/pushNotifications';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
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
    const { status, notes } = await request.json();

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
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

    const previousStatus = order.status;

    // For delivery orders, redirect ready_for_pickup to ready_for_delivery
    let finalStatus = status;
    if (order.orderType === 'delivery' && status === 'ready_for_pickup') {
      finalStatus = 'ready_for_delivery';
    }

    // Get initials from name (first letter of first and last name)
    const getInitials = (name: string) => {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    };

    // Track folding transitions
    if (finalStatus === 'folding' && previousStatus !== 'folding') {
      // Starting to fold - log who started
      order.foldingStartedBy = currentUser.name;
      order.foldingStartedByInitials = getInitials(currentUser.name);
      order.foldingStartedAt = new Date();
    }

    if (finalStatus === 'folded' && previousStatus !== 'folded') {
      // Finished folding - log who finished
      order.foldedBy = currentUser.name;
      order.foldedByInitials = getInitials(currentUser.name);
      order.foldedAt = new Date();
    }

    // Update status
    order.status = finalStatus;

    // Add to status history
    order.statusHistory.push({
      status: finalStatus,
      changedBy: currentUser.name,
      changedAt: new Date(),
      notes: notes || '',
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
        details: `Changed order #${order.orderId} status from ${previousStatus} to ${finalStatus}`,
        metadata: {
          orderId: order.orderId,
          previousStatus,
          newStatus: finalStatus,
          notes,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Send push notification to all staff (except the user who made the change)
    notifyOrderStatusChange(
      order._id.toString(),
      order.orderId,
      order.customerName,
      finalStatus,
      currentUser.userId
    ).catch(err => console.error('Push notification error:', err));

    return NextResponse.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
