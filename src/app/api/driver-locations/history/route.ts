import { NextRequest, NextResponse } from 'next/server';
import { getAuthDatabase } from '@/lib/db/connection';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import { ObjectId } from 'mongodb';

// GET - Get location history for a specific driver (admin only)
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = await getAuthDatabase();
    const user = await db.collection('v5users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { name: 1, email: 1, locationHistory: 1, currentGpsLocation: 1 } }
    );

    if (!user) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    return NextResponse.json({
      name: user.name || user.email,
      history: user.locationHistory || [],
    });
  } catch (error) {
    console.error('Get driver history error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

// DELETE - Clear location history for current driver (when clocking out)
export async function DELETE() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const db = await getAuthDatabase();
    await db.collection('v5users').updateOne(
      { _id: new ObjectId(currentUser.userId) },
      { $set: { locationHistory: [] } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Clear driver history error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
