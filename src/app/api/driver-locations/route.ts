import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

// GET - Get all driver locations (admin only)
export async function GET() {
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
        { error: 'Not authorized. Admin access required.' },
        { status: 403 }
      );
    }

    await connectDB();

    // Get all active drivers who have GPS location
    const drivers = await User.find({
      isDriver: true,
      isActive: true,
      'currentGpsLocation.latitude': { $exists: true },
    })
      .select('firstName lastName currentGpsLocation isClockedIn isOnBreak')
      .lean();

    const driverLocations = drivers.map((driver) => ({
      userId: driver._id.toString(),
      name: `${driver.firstName} ${driver.lastName}`,
      latitude: driver.currentGpsLocation?.latitude,
      longitude: driver.currentGpsLocation?.longitude,
      heading: driver.currentGpsLocation?.heading,
      speed: driver.currentGpsLocation?.speed,
      accuracy: driver.currentGpsLocation?.accuracy,
      updatedAt: driver.currentGpsLocation?.updatedAt,
      isOnBreak: driver.isOnBreak,
    }));

    return NextResponse.json({ drivers: driverLocations });
  } catch (error) {
    console.error('Get driver locations error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// POST - Update current driver's location
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

    const body = await request.json();
    const { latitude, longitude, heading, speed, accuracy } = body;

    // Validate required fields
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Valid latitude and longitude are required' },
        { status: 400 }
      );
    }

    // Update user's GPS location
    await User.findByIdAndUpdate(currentUser.userId, {
      currentGpsLocation: {
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        accuracy: accuracy ?? null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update driver location error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// DELETE - Clear current driver's location (when going offline)
export async function DELETE() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    // Clear user's GPS location
    await User.findByIdAndUpdate(currentUser.userId, {
      currentGpsLocation: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Clear driver location error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
