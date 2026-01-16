import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Order, Customer, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Try to find by MongoDB _id, then by timestamp id, then by orderId
    let order = await Order.findById(id).lean();

    if (!order) {
      order = await Order.findOne({ id }).lean();
    }

    if (!order) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        order = await Order.findOne({ orderId: numericId }).lean();
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Fetch customer - build query based on customerId format
    const customerQuery: { $or: Record<string, unknown>[] } = { $or: [] };

    // Only include _id query if customerId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(order.customerId)) {
      customerQuery.$or.push({ _id: order.customerId });
    }

    // Include numeric id query
    const numericCustomerId = parseInt(order.customerId);
    if (!isNaN(numericCustomerId)) {
      customerQuery.$or.push({ id: numericCustomerId });
    }

    const customer = customerQuery.$or.length > 0
      ? await Customer.findOne(customerQuery).lean()
      : null;

    return NextResponse.json({
      ...order,
      _id: order._id.toString(),
      customer,
    });
  } catch (error) {
    console.error('Get order error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
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
    const updates = await request.json();

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

    // If marking as paid, automatically set paidAt timestamp and paidBy
    if (updates.isPaid === true && !order.isPaid) {
      updates.paidAt = new Date();
      updates.paidBy = currentUser.name;
    }
    // If unmarking as paid, clear paidAt and paidBy
    if (updates.isPaid === false && order.isPaid) {
      updates.paidAt = null;
      updates.paidBy = null;
    }

    // Update the order
    Object.assign(order, updates);
    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_order',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Updated order #${order.orderId}`,
        metadata: { orderId: order.orderId, updates: Object.keys(updates) },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Update order error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only admins can delete orders
    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;

    // Find and delete the order
    let order = await Order.findByIdAndDelete(id);

    if (!order) {
      order = await Order.findOneAndDelete({ id });
    }

    if (!order) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        order = await Order.findOneAndDelete({ orderId: numericId });
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'delete_order',
        entityType: 'order',
        entityId: id,
        details: `Deleted order #${order.orderId}`,
        metadata: { orderId: order.orderId, customerName: order.customerName },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
