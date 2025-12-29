import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

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

    return NextResponse.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
