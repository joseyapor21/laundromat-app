import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, Location } from '@/lib/db/models';
import { createToken, getTokenExpiry, setAuthCookie } from '@/lib/auth';

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

    await connectDB();

    // Find all active users with a PIN set
    const usersWithPin = await User.find({
      pin: { $ne: null, $exists: true },
      isActive: true
    });

    if (usersWithPin.length === 0) {
      return NextResponse.json(
        { error: 'No users configured for PIN login' },
        { status: 404 }
      );
    }

    // Check each user's PIN
    let matchedUser = null;
    for (const user of usersWithPin) {
      const isMatch = await user.comparePin(pin);
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
      firstName: matchedUser.firstName,
      lastName: matchedUser.lastName,
      role: matchedUser.role,
      isDriver: matchedUser.isDriver,
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
