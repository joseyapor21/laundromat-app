import { NextRequest, NextResponse } from 'next/server';
import { getAuthDatabase } from '@/lib/db/connection';
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

    const db = await getAuthDatabase();

    // Update user's push token
    await db.collection('users').updateOne(
      { _id: new ObjectId(currentUser._id) },
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

    const db = await getAuthDatabase();

    // Remove user's push token
    await db.collection('users').updateOne(
      { _id: new ObjectId(currentUser._id) },
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
