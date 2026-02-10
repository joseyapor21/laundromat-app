import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

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

    // Try to find by MongoDB _id or by numeric id
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

    return NextResponse.json({
      ...customer,
      _id: customer._id.toString(),
    });
  } catch (error) {
    console.error('Get customer error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
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
    const updates = await request.json();

    // Find the customer
    let customer = await Customer.findById(id);

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

    // Update the customer
    Object.assign(customer, updates);
    await customer.save();

    // Log the activity
    try {
      await ActivityLog.create({
        locationId: customer.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_customer',
        entityType: 'customer',
        entityId: customer._id.toString(),
        details: `Updated customer ${customer.name}`,
        metadata: { customerId: customer.id, updates: Object.keys(updates) },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      ...customer.toObject(),
      _id: customer._id.toString(),
    });
  } catch (error) {
    console.error('Update customer error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;

    // Find and delete the customer
    let customer = await Customer.findByIdAndDelete(id);

    if (!customer) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        customer = await Customer.findOneAndDelete({ id: numericId });
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Log the activity
    try {
      await ActivityLog.create({
        locationId: customer.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'delete_customer',
        entityType: 'customer',
        entityId: id,
        details: `Deleted customer ${customer.name}`,
        metadata: { customerId: customer.id, name: customer.name },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
