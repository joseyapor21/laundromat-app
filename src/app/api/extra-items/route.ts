import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ExtraItem, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

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

    const extraItems = await ExtraItem.find().sort({ name: 1 }).lean();

    return NextResponse.json(extraItems.map(item => ({
      ...item,
      _id: item._id.toString(),
    })));
  } catch (error) {
    console.error('Get extra items error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const itemData = await request.json();

    const newItem = new ExtraItem(itemData);
    await newItem.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'create_extra_item',
        entityType: 'extra_item',
        entityId: newItem._id.toString(),
        details: `Created extra item ${itemData.name}`,
        metadata: { name: itemData.name, price: itemData.price },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      ...newItem.toObject(),
      _id: newItem._id.toString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Create extra item error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
