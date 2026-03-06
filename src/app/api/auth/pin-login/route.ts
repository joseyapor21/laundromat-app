import { NextRequest, NextResponse } from 'next/server';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { Location, User } from '@/lib/db/models';
import { createToken, getTokenExpiry, setAuthCookie } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { pin, locationId } = await request.json();

    if (!pin) {
      return NextResponse.json(
        { error: 'PIN is required' },
        { status: 400 }
      );
    }

    if (!locationId) {
      return NextResponse.json(
        { error: 'Location is required for kiosk mode' },
        { status: 400 }
      );
    }

    // Connect to app database first
    await connectDB();

    // Check main app User model for users with PIN
    const appUsersWithPin = await User.find({
      pin: { $ne: null, $exists: true },
      isActive: { $ne: false }
    }).lean();

    // Also check auth database users collection
    const authDb = await getAuthDatabase();
    const authUsersWithPin = await authDb.collection('users').find({
      pin: { $ne: null, $exists: true },
      isActive: true
    }).toArray();

    // Combine both lists
    const allUsersWithPin: any[] = [
      ...appUsersWithPin.map(u => ({ ...u, source: 'app' })),
      ...authUsersWithPin.map(u => ({ ...u, source: 'auth' }))
    ];

    if (allUsersWithPin.length === 0) {
      return NextResponse.json(
        { error: 'No users configured for PIN login' },
        { status: 404 }
      );
    }

    // Check each user's PIN
    let matchedUser: any = null;
    for (const user of allUsersWithPin) {
      const isMatch = await bcrypt.compare(pin, user.pin as string);
      if (isMatch) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    // Connect to app database for locations
    await connectDB();

    // Verify location exists
    const location = await Location.findById(locationId);
    if (!location || !location.isActive) {
      return NextResponse.json(
        { error: 'Invalid location' },
        { status: 400 }
      );
    }

    // Create JWT token with user info
    const userPayload = {
      _id: matchedUser._id.toString(),
      email: matchedUser.email,
      firstName: matchedUser.firstName || '',
      lastName: matchedUser.lastName || '',
      role: matchedUser.role || 'employee',
      isDriver: matchedUser.isDriver || false,
      isActive: true,
      isKioskMode: true,  // Flag to indicate kiosk mode login
    };

    const token = await createToken(userPayload);

    // Set the auth cookie
    await setAuthCookie(token);

    return NextResponse.json({
      token,
      expiresAt: getTokenExpiry().toISOString(),
      user: userPayload,
      location: {
        _id: location._id.toString(),
        name: location.name,
        code: location.code,
        address: location.address,
      },
    });
  } catch (error) {
    console.error('PIN login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during PIN login' },
      { status: 500 }
    );
  }
}
