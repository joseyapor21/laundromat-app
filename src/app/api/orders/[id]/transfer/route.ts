import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/orders/[id]/transfer - Mark order as transferred from washer to dryer
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

    // Find the order
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Validate status - should be in_washer to transfer
    if (order.status !== 'in_washer') {
      return NextResponse.json(
        { error: `Cannot transfer order in ${order.status} status. Order must be in washer.` },
        { status: 400 }
      );
    }

    // Get initials from user name
    const nameParts = currentUser.name.split(' ');
    const initials = nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
      : currentUser.name.substring(0, 2).toUpperCase();

    // Update the order
    order.status = 'transferred';
    order.transferredBy = currentUser.name;
    order.transferredByInitials = initials;
    order.transferredAt = new Date();

    // Add to status history
    order.statusHistory.push({
      status: 'transferred',
      changedBy: currentUser.name,
      changedAt: new Date(),
      notes: 'Transferred from washer to dryer',
    });

    await order.save();

    // Log activity
    try {
      await ActivityLog.create({
        locationId: order.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'status_change',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Order #${order.orderId} transferred to dryer by ${currentUser.name}`,
        metadata: {
          orderId: order.orderId,
          previousStatus: 'in_washer',
          newStatus: 'transferred',
          transferredBy: currentUser.name,
          transferredByInitials: initials,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Order transferred to dryer',
      order: {
        ...order.toObject(),
        _id: order._id.toString(),
      },
    });
  } catch (error) {
    console.error('Transfer order error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
