import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer, ActivityLog, getNextCustomerSequence } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

// POST /api/customers/copy - Copy a customer from another location to current location
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!currentUser.locationId) {
      return NextResponse.json(
        { error: 'No location assigned' },
        { status: 400 }
      );
    }

    await connectDB();

    const { sourceCustomerId } = await request.json();

    if (!sourceCustomerId) {
      return NextResponse.json(
        { error: 'Source customer ID is required' },
        { status: 400 }
      );
    }

    // Find the source customer
    const sourceCustomer = await Customer.findById(sourceCustomerId).lean();

    if (!sourceCustomer) {
      return NextResponse.json(
        { error: 'Source customer not found' },
        { status: 404 }
      );
    }

    // Check if customer is from a different location
    if (sourceCustomer.locationId?.toString() === currentUser.locationId) {
      return NextResponse.json(
        { error: 'Customer is already in your location' },
        { status: 400 }
      );
    }

    // Check if customer with same phone already exists in current location
    const normalizedPhone = sourceCustomer.phoneNumber.replace(/\D/g, '');
    const existingByPhone = await Customer.findOne({
      locationId: currentUser.locationId,
      $or: [
        { phoneNumber: sourceCustomer.phoneNumber },
        { phoneNumber: { $regex: normalizedPhone.slice(-10) } },
      ],
    });

    if (existingByPhone) {
      return NextResponse.json(
        {
          error: `A customer with this phone number already exists: ${existingByPhone.name}`,
          existingCustomer: {
            _id: existingByPhone._id.toString(),
            name: existingByPhone.name,
            phoneNumber: existingByPhone.phoneNumber,
          }
        },
        { status: 409 }
      );
    }

    // Generate new customer ID for this location
    const newCustomerId = await getNextCustomerSequence(currentUser.locationId);

    // Create the new customer (copy data but not credit/creditHistory)
    const newCustomer = new Customer({
      id: newCustomerId,
      locationId: currentUser.locationId,
      name: sourceCustomer.name,
      phoneNumber: sourceCustomer.phoneNumber,
      address: sourceCustomer.address || '',
      buzzerCode: sourceCustomer.buzzerCode || '',
      deliveryFee: sourceCustomer.deliveryFee || '$03.00',
      notes: sourceCustomer.notes || '',
      credit: 0, // Don't copy credit - it's location-specific
      creditHistory: [],
    });

    await newCustomer.save();

    // Log the activity
    try {
      await ActivityLog.create({
        locationId: currentUser.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'copy_customer',
        entityType: 'customer',
        entityId: newCustomer._id.toString(),
        details: `Copied customer ${sourceCustomer.name} from another location`,
        metadata: {
          customerId: newCustomerId,
          name: sourceCustomer.name,
          sourceCustomerId: sourceCustomer._id.toString(),
          sourceLocationId: sourceCustomer.locationId?.toString(),
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      message: `Customer ${newCustomer.name} copied to your location`,
      customer: {
        ...newCustomer.toObject(),
        _id: newCustomer._id.toString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Copy customer error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
