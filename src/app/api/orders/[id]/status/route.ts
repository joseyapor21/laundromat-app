import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog, Machine, Customer } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { notifyOrderStatusChange, notifyDriversForDelivery, notifyOrderPickedUp } from '@/lib/services/pushNotifications';

// Statuses where machines should be released (past washer/dryer stages)
const POST_MACHINE_STATUSES = [
  'laid_on_cart',
  'on_cart',
  'folding',
  'folded',
  'ready_for_pickup',
  'ready_for_delivery',
  'out_for_delivery',
  'completed',
  'cancelled',
];

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

    // Release all machines if moving to a post-machine status
    if (POST_MACHINE_STATUSES.includes(finalStatus)) {
      const activeAssignments = order.machineAssignments?.filter(
        (a: { removedAt?: Date }) => !a.removedAt
      ) || [];

      for (const assignment of activeAssignments) {
        if (assignment.machineId) {
          // Release the machine
          await Machine.findByIdAndUpdate(assignment.machineId, {
            status: 'available',
            currentOrderId: null,
            lastUsedAt: new Date(),
          });
        }
      }

      // Mark all assignments as removed
      if (activeAssignments.length > 0) {
        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              'machineAssignments.$[elem].removedAt': new Date(),
              'machineAssignments.$[elem].removedBy': 'System (Status Change)',
            },
          },
          {
            arrayFilters: [{ 'elem.removedAt': { $exists: false } }],
          }
        );
      }
    }

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

    // Send push notification to clocked-in staff at this location (except the user who made the change)
    const notifyOptions = { excludeUserId: currentUser.userId, locationId: order.locationId?.toString() };
    notifyOrderStatusChange(
      order._id.toString(),
      order.orderId,
      order.customerName,
      finalStatus,
      notifyOptions
    ).catch(err => console.error('Push notification error:', err));

    // Special notifications for specific status changes
    if (finalStatus === 'ready_for_delivery' && order.orderType === 'delivery') {
      // Notify clocked-in drivers when a delivery order is ready
      let customerAddress = '';
      try {
        const customer = await Customer.findById(order.customerId);
        customerAddress = customer?.address || '';
      } catch (e) {
        console.error('Error getting customer address:', e);
      }
      notifyDriversForDelivery(
        order._id.toString(),
        order.orderId,
        order.customerName,
        customerAddress,
        notifyOptions
      ).catch(err => console.error('Driver notification error:', err));
    }

    if (finalStatus === 'out_for_delivery' || finalStatus === 'completed') {
      // Notify clocked-in users when order is picked up (by customer or for delivery)
      notifyOrderPickedUp(
        order._id.toString(),
        order.orderId,
        order.customerName,
        order.orderType === 'delivery',
        notifyOptions
      ).catch(err => console.error('Pickup notification error:', err));
    }

    // Convert to plain object to avoid circular reference issues
    const updatedOrder = await Order.findById(order._id).populate('customer').lean();
    return NextResponse.json(updatedOrder);
  } catch (error) {
    console.error('Update order status error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
