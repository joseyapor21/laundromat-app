import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, Customer } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import mongoose from 'mongoose';

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

    // Find the customer first to get both _id and numeric id
    let customer = await Customer.findById(id).lean();

    if (!customer) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        customer = await Customer.findOne({ id: numericId }).lean();
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Build query to find orders by either _id or numeric id
    const customerIdString = customer._id.toString();
    const customerNumericId = customer.id?.toString();

    const orderQuery: { $or: { customerId: string }[] } = { $or: [] };
    orderQuery.$or.push({ customerId: customerIdString });
    if (customerNumericId) {
      orderQuery.$or.push({ customerId: customerNumericId });
    }

    // Get orders for this customer, sorted by most recent first
    const orders = await Order.find(orderQuery)
      .sort({ dropOffDate: -1 })
      .limit(50)
      .lean();

    // Transform orders to include necessary data
    const ordersWithDetails = orders.map(order => {
      // Cast to any to access timestamp fields that mongoose adds
      const orderAny = order as any;
      return {
        _id: order._id.toString(),
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        status: order.status,
        orderType: order.orderType,
        totalAmount: order.totalAmount,
        isPaid: order.isPaid,
        paymentMethod: order.paymentMethod,
        weight: order.weight,
        bags: order.bags,
        statusHistory: order.statusHistory || [],
        machineAssignments: order.machineAssignments || [],
        createdAt: orderAny.createdAt || order.dropOffDate,
        dropOffDate: order.dropOffDate,
        pickupDate: orderAny.pickupDate,
        deliveryDate: orderAny.deliveryDate,
        isSameDay: order.isSameDay,
        // Folding info
        foldedBy: orderAny.foldedBy,
        foldedByInitials: orderAny.foldedByInitials,
        foldedAt: orderAny.foldedAt,
        foldingCheckedBy: orderAny.foldingCheckedBy,
        foldingCheckedByInitials: orderAny.foldingCheckedByInitials,
        foldingCheckedAt: orderAny.foldingCheckedAt,
      };
    });

    return NextResponse.json(ordersWithDetails);
  } catch (error) {
    console.error('Get customer orders error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
