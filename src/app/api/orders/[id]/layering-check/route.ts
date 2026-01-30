import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Verify layering (dryer check) and move to folding status
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

    // Ensure order is in laid_on_cart status
    if (order.status !== 'laid_on_cart') {
      return NextResponse.json(
        { error: 'Order must be in "On Cart" status to verify layering' },
        { status: 400 }
      );
    }

    // Get the last person who used the dryer for this order
    const lastDryerAssignment = order.machineAssignments
      ?.filter((a: { machineType: string; removedAt?: Date }) => a.machineType === 'dryer')
      .sort((a: { assignedAt: Date }, b: { assignedAt: Date }) =>
        new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
      )[0];

    // Prevent same person who assigned the dryer from checking
    if (lastDryerAssignment && lastDryerAssignment.assignedBy && checkedBy &&
        lastDryerAssignment.assignedBy.toLowerCase() === checkedBy.toLowerCase()) {
      return NextResponse.json(
        { error: 'The person who assigned the dryer cannot verify the layering. A different person must check.' },
        { status: 400 }
      );
    }

    // Update layering check info (status stays at laid_on_cart)
    order.layeringCheckedBy = checkedBy;
    order.layeringCheckedByInitials = checkedByInitials || '';
    order.layeringCheckedAt = new Date();

    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_order',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Order #${order.orderId} layering verified by ${checkedBy}`,
        metadata: {
          orderId: order.orderId,
          checkedBy,
          checkedByInitials,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Layering verified by ${checkedBy}`,
      order,
    });
  } catch (error) {
    console.error('Layering check error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
