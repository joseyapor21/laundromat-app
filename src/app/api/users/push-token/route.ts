import { NextRequest, NextResponse } from 'next/server';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { ObjectId } from 'mongodb';

// POST - Register push token
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
    const { pushToken, platform } = body;

    if (!pushToken) {
      return NextResponse.json(
        { error: 'Push token is required' },
        { status: 400 }
      );
    }

    if (platform && !['ios', 'android'].includes(platform)) {
      return NextResponse.json(
        { error: 'Invalid platform. Must be ios or android' },
        { status: 400 }
      );
    }

    // Update in auth database (v5users collection)
    const db = await getAuthDatabase();
    await db.collection('v5users').updateOne(
      { _id: new ObjectId(currentUser.userId) },
      {
        $set: {
          pushToken,
          pushTokenPlatform: platform || null,
        },
      }
    );

    // Also update in app User model if user exists there (for role-based notifications)
    await connectDB();
    await User.findOneAndUpdate(
      { email: currentUser.email.toLowerCase() },
      {
        $set: {
          pushToken,
          pushTokenPlatform: platform || null,
        },
      }
    );

    console.log(`Push token registered for user ${currentUser.email}: ${pushToken.substring(0, 20)}...`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error registering push token:', error);
    return NextResponse.json(
      { error: 'Failed to register push token' },
      { status: 500 }
    );
  }
}

// DELETE - Unregister push token
export async function DELETE() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Remove from auth database (v5users collection)
    const db = await getAuthDatabase();
    await db.collection('v5users').updateOne(
      { _id: new ObjectId(currentUser.userId) },
      {
        $set: {
          pushToken: null,
          pushTokenPlatform: null,
        },
      }
    );

    // Also remove from app User model
    await connectDB();
    await User.findOneAndUpdate(
      { email: currentUser.email.toLowerCase() },
      {
        $set: {
          pushToken: null,
          pushTokenPlatform: null,
        },
      }
    );

    console.log(`Push token unregistered for user ${currentUser.email}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unregistering push token:', error);
    return NextResponse.json(
      { error: 'Failed to unregister push token' },
      { status: 500 }
    );
  }
}
