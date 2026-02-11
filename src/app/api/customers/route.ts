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

    // Build location query for duplicate checking
    const locationQuery = currentUser.locationId
      ? { locationId: currentUser.locationId }
      : {};

    // Check for duplicate phone number
    if (customerData.phoneNumber) {
      // Normalize phone number for comparison (remove all non-digits)
      const normalizedPhone = customerData.phoneNumber.replace(/\D/g, '');
      const existingByPhone = await Customer.findOne({
        ...locationQuery,
        $or: [
          { phoneNumber: customerData.phoneNumber },
          { phoneNumber: { $regex: normalizedPhone.slice(-10) } }, // Match last 10 digits
        ],
      });

      if (existingByPhone) {
        return NextResponse.json(
          { error: `A customer with this phone number already exists: ${existingByPhone.name}` },
          { status: 409 }
        );
      }
    }

    // Check for duplicate name (case-insensitive)
    if (customerData.name) {
      const existingByName = await Customer.findOne({
        ...locationQuery,
        name: { $regex: new RegExp(`^${customerData.name.trim()}$`, 'i') },
      });

      if (existingByName) {
        return NextResponse.json(
          { error: `A customer with this name already exists. Phone: ${existingByName.phoneNumber}` },
          { status: 409 }
        );
      }
    }

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
        locationId: newCustomer.locationId,
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
