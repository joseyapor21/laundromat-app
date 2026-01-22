import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer, ActivityLog, getNextCustomerSequence, CustomerCounter } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

// Helper to fix counter if out of sync
async function fixCustomerCounter(): Promise<number> {
  const maxCustomer = await Customer.findOne().sort({ id: -1 }).lean();
  const maxId = maxCustomer?.id || 0;
  const newCounterValue = maxId + 1;

  await CustomerCounter.findByIdAndUpdate(
    'customerId',
    { next: newCounterValue },
    { upsert: true }
  );

  return newCounterValue;
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const customers = await Customer.find().sort({ name: 1 }).lean();

    return NextResponse.json(customers.map(c => ({
      ...c,
      _id: c._id.toString(),
      credit: c.credit || 0,
      creditHistory: c.creditHistory || [],
    })));
  } catch (error) {
    console.error('Get customers error:', error);
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

    const customerData = await request.json();

    // Generate customer ID
    let customerId = await getNextCustomerSequence();
    let newCustomer;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        newCustomer = new Customer({
          ...customerData,
          id: customerId,
        });
        await newCustomer.save();
        break; // Success, exit loop
      } catch (saveError: any) {
        // Check if it's a duplicate key error
        if (saveError.code === 11000 && saveError.keyPattern?.id) {
          console.log(`Duplicate key error for customer id ${customerId}, fixing counter...`);
          customerId = await fixCustomerCounter();
          retryCount++;
        } else {
          throw saveError; // Re-throw if it's a different error
        }
      }
    }

    if (!newCustomer) {
      throw new Error('Failed to create customer after multiple retries');
    }

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'create_customer',
        entityType: 'customer',
        entityId: newCustomer._id.toString(),
        details: `Created customer ${customerData.name}`,
        metadata: { customerId, name: customerData.name },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      ...newCustomer.toObject(),
      _id: newCustomer._id.toString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Create customer error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
