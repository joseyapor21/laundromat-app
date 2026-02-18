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

    // Fetch customer - use ObjectId if valid, otherwise try numeric id with locationId
    let customer = null;

    if (mongoose.Types.ObjectId.isValid(order.customerId)) {
      // Primary lookup by ObjectId - this is unique
      customer = await Customer.findById(order.customerId).lean();
    }

    // Fallback to numeric id lookup only if ObjectId lookup failed
    // and customerId looks like a pure number (legacy format)
    if (!customer && /^\d+$/.test(order.customerId)) {
      const numericCustomerId = parseInt(order.customerId);
      // Include locationId to ensure we get the correct customer for this order's location
      customer = await Customer.findOne({
        id: numericCustomerId,
        locationId: order.locationId
      }).lean();
    }

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
        locationId: order.locationId,
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

    // First find the order (without deleting) to check for credit refund
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

    // Refund credit if any was applied to this order
    if (order.creditApplied && order.creditApplied > 0 && order.customerId) {
      try {
        // Find the customer
        let customer = null;
        if (mongoose.Types.ObjectId.isValid(order.customerId)) {
          customer = await Customer.findById(order.customerId);
        }
        if (!customer && /^\d+$/.test(order.customerId)) {
          customer = await Customer.findOne({
            id: parseInt(order.customerId),
            locationId: order.locationId
          });
        }

        if (customer) {
          // Add credit back to customer
          const currentCredit = customer.credit || 0;
          customer.credit = currentCredit + order.creditApplied;

          // Add to credit history
          if (!customer.creditHistory) {
            customer.creditHistory = [];
          }
          customer.creditHistory.push({
            amount: order.creditApplied,
            type: 'add',
            description: `Refund from deleted order #${order.orderId}`,
            orderId: order._id.toString(),
            addedBy: currentUser.name,
            createdAt: new Date(),
          });

          await customer.save();
          console.log(`Refunded $${order.creditApplied} credit to customer ${customer.name} from deleted order #${order.orderId}`);
        }
      } catch (creditError) {
        console.error('Failed to refund credit on order delete:', creditError);
        // Continue with deletion even if credit refund fails
      }
    }

    // Soft delete the order instead of hard delete
    order.deletedAt = new Date();
    order.deletedBy = currentUser.userId;
    order.deletedByName = currentUser.name;
    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        locationId: order.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'delete_order',
        entityType: 'order',
        entityId: id,
        details: `Moved order #${order.orderId} to trash`,
        metadata: { orderId: order.orderId, customerName: order.customerName },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ message: 'Order moved to trash' });
  } catch (error) {
    console.error('Delete order error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
