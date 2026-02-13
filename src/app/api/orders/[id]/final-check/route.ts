import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/orders/[id]/final-check - Final quality check before marking ready
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
    const { finalWeight, forceSamePerson } = body;

    // Find the order
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Validate status - should be folded
    if (order.status !== 'folded') {
      return NextResponse.json(
        { error: `Cannot do final check for order in ${order.status} status. Order must be folded.` },
        { status: 400 }
      );
    }

    // Check if same person who folded - warn but allow with forceSamePerson flag
    const isSamePerson = order.foldedBy === currentUser.name;
    if (isSamePerson && !forceSamePerson) {
      return NextResponse.json(
        {
          error: 'Same person warning',
          message: 'You marked this order as folded. Ideally another person should verify. Are you sure you want to verify your own work?',
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

    // Determine target status based on order type
    const targetStatus = order.orderType === 'delivery' ? 'ready_for_delivery' : 'ready_for_pickup';

    // Update the order
    order.status = targetStatus;
    order.finalCheckedBy = currentUser.name;
    order.finalCheckedByInitials = initials;
    order.finalCheckedAt = new Date();

    // Store final weight if provided
    if (finalWeight !== undefined && finalWeight !== null) {
      order.finalWeight = finalWeight;
    }

    // Add to status history
    order.statusHistory.push({
      status: targetStatus,
      changedBy: currentUser.name,
      changedAt: new Date(),
      notes: `Final check completed${finalWeight ? ` - Verified weight: ${finalWeight} lbs` : ''}${isSamePerson ? ' (same person)' : ''}`,
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
        details: `Order #${order.orderId} final check by ${currentUser.name}, now ${targetStatus}`,
        metadata: {
          orderId: order.orderId,
          previousStatus: 'folded',
          newStatus: targetStatus,
          finalCheckedBy: currentUser.name,
          finalCheckedByInitials: initials,
          finalWeight: finalWeight || null,
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
      message: `Order is now ${targetStatus === 'ready_for_delivery' ? 'ready for delivery' : 'ready for pickup'}`,
      order: {
        ...order.toObject(),
        _id: order._id.toString(),
      },
    });
  } catch (error) {
    console.error('Final check error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
