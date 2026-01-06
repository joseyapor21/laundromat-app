import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Check a bag as folded
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only admin and super_admin can check folding
    if (!['admin', 'super_admin'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only admins can check folding' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;
    const { bagIdentifier, checkerInitials } = await request.json();

    if (!bagIdentifier) {
      return NextResponse.json(
        { error: 'Bag identifier is required' },
        { status: 400 }
      );
    }

    if (!checkerInitials || checkerInitials.length < 2) {
      return NextResponse.json(
        { error: 'Checker initials are required (at least 2 characters)' },
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

    // Find the bag
    const bagIndex = order.bags.findIndex((b: { identifier: string }) => b.identifier === bagIdentifier);
    if (bagIndex === -1) {
      return NextResponse.json(
        { error: 'Bag not found' },
        { status: 404 }
      );
    }

    // Mark as folding checked
    order.bags[bagIndex].isFoldingChecked = true;
    order.bags[bagIndex].foldingCheckedAt = new Date();
    order.bags[bagIndex].foldingCheckedBy = currentUser.name;
    order.bags[bagIndex].foldingCheckedByInitials = checkerInitials;

    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_order',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Marked bag ${bagIdentifier} as folding checked for order #${order.orderId}`,
        metadata: {
          orderId: order.orderId,
          bagIdentifier,
          checkerInitials,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Bag ${bagIdentifier} marked as folding checked by ${checkerInitials}`,
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

// DELETE - Uncheck a bag's folding status
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only admin and super_admin can uncheck folding
    if (!['admin', 'super_admin'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only admins can uncheck folding' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;
    const { bagIdentifier } = await request.json();

    if (!bagIdentifier) {
      return NextResponse.json(
        { error: 'Bag identifier is required' },
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

    // Find the bag
    const bagIndex = order.bags.findIndex((b: { identifier: string }) => b.identifier === bagIdentifier);
    if (bagIndex === -1) {
      return NextResponse.json(
        { error: 'Bag not found' },
        { status: 404 }
      );
    }

    // Remove folding check
    order.bags[bagIndex].isFoldingChecked = false;
    order.bags[bagIndex].foldingCheckedAt = undefined;
    order.bags[bagIndex].foldingCheckedBy = undefined;
    order.bags[bagIndex].foldingCheckedByInitials = undefined;

    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_order',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Unchecked folding for bag ${bagIdentifier} on order #${order.orderId}`,
        metadata: {
          orderId: order.orderId,
          bagIdentifier,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Folding check removed from bag ${bagIdentifier}`,
      order,
    });
  } catch (error) {
    console.error('Folding uncheck error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
