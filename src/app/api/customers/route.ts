import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer, ActivityLog, getNextCustomerSequence } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

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

    // Filter by location if specified
    const query = currentUser.locationId
      ? { locationId: currentUser.locationId }
      : {};

    const customers = await Customer.find(query).sort({ name: 1 }).lean();

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

    // Generate customer ID (scoped to location if available)
    const customerId = await getNextCustomerSequence(currentUser.locationId);

    const newCustomer = new Customer({
      ...customerData,
      id: customerId,
      ...(currentUser.locationId && { locationId: currentUser.locationId }),
    });

    await newCustomer.save();

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
