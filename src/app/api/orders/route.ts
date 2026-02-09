import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, Customer, ActivityLog, getNextOrderSequence } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { notifyNewOrder } from '@/lib/services/pushNotifications';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const date = searchParams.get('date');
    const paidDate = searchParams.get('paidDate');

    // Build query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {};

    // Filter by location if specified
    if (currentUser.locationId) {
      query.locationId = currentUser.locationId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.dropOffDate = { $gte: startOfDay, $lte: endOfDay };
    }

    // Filter by paidAt date (for cashier reports)
    if (paidDate) {
      const startOfDay = new Date(paidDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(paidDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.paidAt = { $gte: startOfDay, $lte: endOfDay };
      query.isPaid = true;
    }

    const orders = await Order.find(query).sort({ dropOffDate: -1 }).lean();

    // Get unique customer IDs
    const customerIds = [...new Set(orders.map(order => order.customerId))];

    // Fetch customers
    const customers = await Customer.find({
      $or: [
        { _id: { $in: customerIds.filter(id => id.match(/^[0-9a-fA-F]{24}$/)) } },
        { id: { $in: customerIds.map(id => parseInt(id)).filter(id => !isNaN(id)) } },
      ],
    }).lean();

    // Create customer lookup
    const customerMap = new Map();
    customers.forEach(c => {
      customerMap.set(c._id.toString(), c);
      customerMap.set(c.id?.toString(), c);
    });

    // Attach customer data to orders
    const ordersWithCustomers = orders.map(order => ({
      ...order,
      _id: order._id.toString(),
      customer: customerMap.get(order.customerId) || null,
    }));

    return NextResponse.json(ordersWithCustomers);
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const orderData = await request.json();

    // Generate order IDs (scoped to location if available)
    const timestamp = Date.now().toString();
    const orderId = await getNextOrderSequence(currentUser.locationId);

    const newOrder = new Order({
      ...orderData,
      id: timestamp,
      orderId,
      status: 'new_order',
      ...(currentUser.locationId && { locationId: currentUser.locationId }),
      statusHistory: [{
        status: 'new_order',
        changedBy: currentUser.name,
        changedAt: new Date(),
        notes: 'Order created',
      }],
    });

    await newOrder.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'create_order',
        entityType: 'order',
        entityId: newOrder._id.toString(),
        details: `Created order #${orderId} for ${orderData.customerName}`,
        metadata: { orderId, customerId: orderData.customerId },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Send push notification to all staff about new order
    notifyNewOrder(
      newOrder._id.toString(),
      orderId,
      orderData.customerName,
      orderData.orderType || 'storePickup',
      currentUser.userId
    ).catch(err => console.error('Push notification error:', err));

    return NextResponse.json(newOrder, { status: 201 });
  } catch (error) {
    console.error('Create order error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
