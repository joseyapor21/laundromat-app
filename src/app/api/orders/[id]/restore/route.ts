import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Order, Customer, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Restore a deleted order from trash
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can restore orders
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    // Find the deleted order
    let order = await Order.findOne({ _id: id, deletedAt: { $ne: null } });

    if (!order) {
      order = await Order.findOne({ id, deletedAt: { $ne: null } });
    }

    if (!order) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        order = await Order.findOne({ orderId: numericId, deletedAt: { $ne: null } });
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Deleted order not found' },
        { status: 404 }
      );
    }

    // Check if credit was refunded when deleted - need to deduct it again
    if (order.creditApplied && order.creditApplied > 0 && order.customerId) {
      try {
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
          // Deduct the credit that was refunded
          const currentCredit = customer.credit || 0;
          const newCredit = Math.max(0, currentCredit - order.creditApplied);
          customer.credit = newCredit;

          // Add to credit history
          if (!customer.creditHistory) {
            customer.creditHistory = [];
          }
          customer.creditHistory.push({
            amount: -order.creditApplied,
            type: 'use',
            description: `Credit re-applied from restored order #${order.orderId}`,
            orderId: order._id.toString(),
            addedBy: currentUser.name,
            createdAt: new Date(),
          });

          await customer.save();
          console.log(`Re-applied $${order.creditApplied} credit from customer ${customer.name} for restored order #${order.orderId}`);
        }
      } catch (creditError) {
        console.error('Failed to re-apply credit on order restore:', creditError);
        // Continue with restore even if credit adjustment fails
      }
    }

    // Restore the order
    order.deletedAt = null;
    order.deletedBy = null;
    order.deletedByName = null;
    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        locationId: order.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'restore_order',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Restored order #${order.orderId} from trash`,
        metadata: { orderId: order.orderId, customerName: order.customerName },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Order #${order.orderId} restored successfully`,
      order,
    });
  } catch (error) {
    console.error('Restore order error:', error);
    return NextResponse.json(
      { error: 'Failed to restore order' },
      { status: 500 }
    );
  }
}
