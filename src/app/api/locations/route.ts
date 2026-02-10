import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Location } from '@/lib/db/models';
import { getCurrentUser, hasRole } from '@/lib/auth/server';

// GET /api/locations - List all locations
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

    // Return all active locations (or all for admins)
    const filter = hasRole(currentUser, ['super_admin', 'admin'])
      ? {}
      : { isActive: true };

    const locations = await Location.find(filter).sort({ name: 1 }).lean();

    return NextResponse.json(locations.map(loc => ({
      ...loc,
      _id: loc._id.toString(),
    })));
  } catch (error) {
    console.error('Get locations error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// POST /api/locations - Create a new location (super_admin only)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasRole(currentUser, ['admin', 'super_admin'])) {
      return NextResponse.json(
        { error: 'Admin access required to create locations' },
        { status: 403 }
      );
    }

    await connectDB();

    const locationData = await request.json();

    // Validate required fields
    if (!locationData.name || !locationData.code || !locationData.address) {
      return NextResponse.json(
        { error: 'Name, code, and address are required' },
        { status: 400 }
      );
    }

    // Check if code already exists
    const existingLocation = await Location.findOne({
      code: locationData.code.toUpperCase()
    });

    if (existingLocation) {
      return NextResponse.json(
        { error: 'A location with this code already exists' },
        { status: 400 }
      );
    }

    const newLocation = new Location({
      name: locationData.name,
      code: locationData.code.toUpperCase(),
      address: locationData.address,
      latitude: locationData.latitude || 0,
      longitude: locationData.longitude || 0,
      phone: locationData.phone || '',
      email: locationData.email || '',
      isActive: true,
      createdAt: new Date(),
      createdBy: currentUser.userId,
    });

    await newLocation.save();

    return NextResponse.json({
      ...newLocation.toObject(),
      _id: newLocation._id.toString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Create location error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
