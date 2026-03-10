import { NextRequest, NextResponse } from 'next/server';
import { getAuthDatabase } from '@/lib/db/connection';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import { ObjectId } from 'mongodb';

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

    const db = await getAuthDatabase();

    // Get all users from v5users collection
    const allUsers = await db.collection('v5users')
      .find({})
      .project({ name: 1, email: 1, isDriver: 1, isActive: 1, isClockedIn: 1, currentGpsLocation: 1, isOnBreak: 1 })
      .toArray();

    // Filter to drivers who are clocked in and have GPS, OR sent GPS recently (last 15 min via Driver tab)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const driversWithLocation = allUsers.filter(u =>
      u.isDriver &&
      u.currentGpsLocation?.latitude &&
      (
        u.isClockedIn ||
        (u.currentGpsLocation?.updatedAt && new Date(u.currentGpsLocation.updatedAt) > fifteenMinutesAgo)
      )
    );

    const driverLocations = driversWithLocation.map((driver) => {
      return {
        userId: driver._id.toString(),
        name: driver.name || driver.email,
        latitude: driver.currentGpsLocation?.latitude,
        longitude: driver.currentGpsLocation?.longitude,
        heading: driver.currentGpsLocation?.heading,
        speed: driver.currentGpsLocation?.speed,
        accuracy: driver.currentGpsLocation?.accuracy,
        updatedAt: driver.currentGpsLocation?.updatedAt,
        isOnBreak: driver.isOnBreak || false,
      };
    });

    // Debug info
    const debug = allUsers.slice(0, 10).map(u => ({
      email: u.email,
      isDriver: u.isDriver,
      isClockedIn: u.isClockedIn,
      hasGps: !!u.currentGpsLocation?.latitude,
    }));

    return NextResponse.json({
      drivers: driverLocations,
      debug,
      totalUsers: allUsers.length,
      driversOnline: driversWithLocation.length,
    });
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

    const body = await request.json();
    const { latitude, longitude, heading, speed, accuracy } = body;

    // Validate required fields
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Valid latitude and longitude are required' },
        { status: 400 }
      );
    }

    const db = await getAuthDatabase();

    // Update user's GPS location in v5users collection
    await db.collection('v5users').updateOne(
      { _id: new ObjectId(currentUser.userId) },
      {
        $set: {
          currentGpsLocation: {
            latitude,
            longitude,
            heading: heading ?? null,
            speed: speed ?? null,
            accuracy: accuracy ?? null,
            updatedAt: new Date(),
          },
        },
      }
    );

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

    const db = await getAuthDatabase();

    // Clear user's GPS location
    await db.collection('v5users').updateOne(
      { _id: new ObjectId(currentUser.userId) },
      { $set: { currentGpsLocation: null } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Clear driver location error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
