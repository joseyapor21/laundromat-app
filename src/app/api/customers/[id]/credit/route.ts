import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { Customer, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/customers/[id]/credit - Add or use credit
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

    const { amount, type, description, orderId } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    if (!type || !['add', 'use'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be "add" or "use"' },
        { status: 400 }
      );
    }

    // Find customer by _id or numeric id
    let customer;
    if (mongoose.Types.ObjectId.isValid(id)) {
      customer = await Customer.findById(id);
    }
    if (!customer) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        customer = await Customer.findOne({ id: numericId });
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    const currentCredit = customer.credit || 0;

    // Check if using credit and have enough
    if (type === 'use' && amount > currentCredit) {
      return NextResponse.json(
        { error: `Insufficient credit. Available: $${currentCredit.toFixed(2)}` },
        { status: 400 }
      );
    }

    // Calculate new credit
    const newCredit = type === 'add'
      ? currentCredit + amount
      : currentCredit - amount;

    // Create transaction record
    const transaction = {
      amount,
      type,
      description: description || (type === 'add' ? 'Credit added' : 'Credit used'),
      orderId: orderId || null,
      addedBy: currentUser.name,
      createdAt: new Date(),
    };

    // Update customer
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customer._id,
      {
        $set: { credit: newCredit },
        $push: { creditHistory: transaction },
      },
      { new: true }
    );

    // Log activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_customer',
        entityType: 'customer',
        entityId: customer._id.toString(),
        details: type === 'add'
          ? `Added $${amount.toFixed(2)} credit to ${customer.name}. New balance: $${newCredit.toFixed(2)}`
          : `Used $${amount.toFixed(2)} credit from ${customer.name}. New balance: $${newCredit.toFixed(2)}`,
        metadata: {
          customerId: customer.id,
          customerName: customer.name,
          creditChange: type === 'add' ? amount : -amount,
          previousCredit: currentCredit,
          newCredit: newCredit,
          orderId,
        },
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      message: type === 'add'
        ? `Added $${amount.toFixed(2)} credit`
        : `Used $${amount.toFixed(2)} credit`,
      customer: updatedCustomer,
      previousCredit: currentCredit,
      newCredit: newCredit,
    });
  } catch (error) {
    console.error('Credit operation error:', error);
    return NextResponse.json(
      { error: 'Failed to update credit' },
      { status: 500 }
    );
  }
}

// GET /api/customers/[id]/credit - Get credit history
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

    // Find customer
    let customer;
    if (mongoose.Types.ObjectId.isValid(id)) {
      customer = await Customer.findById(id);
    }
    if (!customer) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        customer = await Customer.findOne({ id: numericId });
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      credit: customer.credit || 0,
      creditHistory: customer.creditHistory || [],
    });
  } catch (error) {
    console.error('Get credit error:', error);
    return NextResponse.json(
      { error: 'Failed to get credit' },
      { status: 500 }
    );
  }
}
