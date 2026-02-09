import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Location } from '@/lib/db/models';
import { getCurrentUser, hasRole } from '@/lib/auth/server';

// GET /api/locations/[id] - Get a single location
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const location = await Location.findById(id).lean();

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...location,
      _id: location._id.toString(),
    });
  } catch (error) {
    console.error('Failed to fetch location:', error);
    return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 });
  }
}

// PUT /api/locations/[id] - Update a location (super_admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasRole(currentUser, ['super_admin'])) {
      return NextResponse.json(
        { error: 'Only super admins can update locations' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;
    const body = await request.json();

    // If updating code, ensure it's uppercase and unique
    if (body.code) {
      body.code = body.code.toUpperCase();
      const existingLocation = await Location.findOne({
        code: body.code,
        _id: { $ne: id }
      });
      if (existingLocation) {
        return NextResponse.json(
          { error: 'A location with this code already exists' },
          { status: 400 }
        );
      }
    }

    const location = await Location.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true }
    ).lean();

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...location,
      _id: location._id.toString(),
    });
  } catch (error) {
    console.error('Failed to update location:', error);
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 });
  }
}

// DELETE /api/locations/[id] - Delete a location (super_admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!hasRole(currentUser, ['super_admin'])) {
      return NextResponse.json(
        { error: 'Only super admins can delete locations' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;

    // Instead of hard delete, deactivate the location
    const location = await Location.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Location deactivated successfully' });
  } catch (error) {
    console.error('Failed to delete location:', error);
    return NextResponse.json({ error: 'Failed to delete location' }, { status: 500 });
  }
}
