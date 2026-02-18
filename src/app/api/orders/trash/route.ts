import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, Customer, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

// GET - List deleted orders (trash)
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can view trash
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {
      deletedAt: { $ne: null },
    };

    // Filter by location if specified
    if (currentUser.locationId) {
      query.locationId = currentUser.locationId;
    }

    const orders = await Order.find(query)
      .sort({ deletedAt: -1 })
      .lean();

    // Get unique customer IDs
    const customerIds = [...new Set(orders.map(order => order.customerId))];

    // Separate ObjectId strings from numeric IDs
    const objectIdStrings = customerIds.filter(id => id.match(/^[0-9a-fA-F]{24}$/));
    const numericIds = customerIds
      .filter(id => /^\d+$/.test(id))
      .map(id => parseInt(id));

    // Build query for customers
    const orConditions = [];
    if (objectIdStrings.length > 0) {
      orConditions.push({ _id: { $in: objectIdStrings } });
    }
    if (numericIds.length > 0) {
      const locationIds = [...new Set(orders.map(o => o.locationId?.toString()).filter(Boolean))];
      orConditions.push({
        id: { $in: numericIds },
        locationId: { $in: locationIds }
      });
    }

    // Fetch customers
    const customers = orConditions.length > 0
      ? await Customer.find({ $or: orConditions }).lean()
      : [];

    // Create customer lookup
    const customerMap = new Map();
    customers.forEach(c => {
      customerMap.set(c._id.toString(), c);
      if (c.id !== undefined) {
        customerMap.set(`${c.locationId}_${c.id}`, c);
      }
    });

    // Attach customer data to orders
    const ordersWithCustomers = orders.map(order => {
      let customer = customerMap.get(order.customerId);
      if (!customer && /^\d+$/.test(order.customerId)) {
        customer = customerMap.get(`${order.locationId}_${order.customerId}`);
      }
      return {
        ...order,
        _id: order._id.toString(),
        customer: customer || null,
      };
    });

    return NextResponse.json(ordersWithCustomers);
  } catch (error) {
    console.error('Get trash error:', error);
    return NextResponse.json(
      { error: 'Failed to get deleted orders' },
      { status: 500 }
    );
  }
}

// DELETE - Permanently delete orders older than 30 days (cleanup)
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Permanently delete orders that have been in trash for 30+ days
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {
      deletedAt: { $lt: thirtyDaysAgo },
    };

    // Filter by location if specified
    if (currentUser.locationId) {
      query.locationId = currentUser.locationId;
    }

    const result = await Order.deleteMany(query);

    // Log the activity
    try {
      await ActivityLog.create({
        locationId: currentUser.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'empty_trash',
        entityType: 'order',
        entityId: 'bulk',
        details: `Permanently deleted ${result.deletedCount} orders from trash`,
        metadata: { deletedCount: result.deletedCount },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Permanently deleted ${result.deletedCount} orders`,
    });
  } catch (error) {
    console.error('Empty trash error:', error);
    return NextResponse.json(
      { error: 'Failed to empty trash' },
      { status: 500 }
    );
  }
}
