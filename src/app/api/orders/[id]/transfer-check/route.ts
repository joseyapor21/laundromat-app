import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/orders/[id]/transfer-check - Verify transfer (washers empty, dryers correct)
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
    const body = await request.json();
    const { forceSamePerson } = body; // Allow same person with confirmation

    // Find the order
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Validate status - should be transferred
    if (order.status !== 'transferred') {
      return NextResponse.json(
        { error: `Cannot verify transfer for order in ${order.status} status. Order must be in transferred status.` },
        { status: 400 }
      );
    }

    // Check if same person - warn but allow with forceSamePerson flag
    const isSamePerson = order.transferredBy === currentUser.name;
    if (isSamePerson && !forceSamePerson) {
      return NextResponse.json(
        {
          error: 'Same person warning',
          message: 'You transferred this order. Ideally another person should verify. Are you sure you want to verify your own work?',
          requireConfirmation: true,
        },
        { status: 409 }
      );
    }

    // Get initials from user name
    const nameParts = currentUser.name.split(' ');
    const initials = nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
      : currentUser.name.substring(0, 2).toUpperCase();

    // Update the order
    order.status = 'transfer_checked';
    order.transferCheckedBy = currentUser.name;
    order.transferCheckedByInitials = initials;
    order.transferCheckedAt = new Date();

    // Add to status history
    order.statusHistory.push({
      status: 'transfer_checked',
      changedBy: currentUser.name,
      changedAt: new Date(),
      notes: isSamePerson ? 'Transfer verified (same person)' : 'Transfer verified',
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
        details: `Order #${order.orderId} transfer verified by ${currentUser.name}${isSamePerson ? ' (same person)' : ''}`,
        metadata: {
          orderId: order.orderId,
          previousStatus: 'transferred',
          newStatus: 'transfer_checked',
          checkedBy: currentUser.name,
          checkedByInitials: initials,
          samePerson: isSamePerson,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Transfer verified',
      order: {
        ...order.toObject(),
        _id: order._id.toString(),
      },
    });
  } catch (error) {
    console.error('Transfer check error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
