import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ExtraItem, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
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
    const { id } = await params;
    const updates = await request.json();

    const item = await ExtraItem.findByIdAndUpdate(
      id,
      updates,
      { new: true }
    );

    if (!item) {
      return NextResponse.json(
        { error: 'Extra item not found' },
        { status: 404 }
      );
    }

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_extra_item',
        entityType: 'extra_item',
        entityId: item._id.toString(),
        details: `Updated extra item ${item.name}`,
        metadata: { name: item.name, updates: Object.keys(updates) },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      ...item.toObject(),
      _id: item._id.toString(),
    });
  } catch (error) {
    console.error('Update extra item error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
    const { id } = await params;

    const item = await ExtraItem.findByIdAndDelete(id);

    if (!item) {
      return NextResponse.json(
        { error: 'Extra item not found' },
        { status: 404 }
      );
    }

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'delete_extra_item',
        entityType: 'extra_item',
        entityId: id,
        details: `Deleted extra item ${item.name}`,
        metadata: { name: item.name },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ message: 'Extra item deleted successfully' });
  } catch (error) {
    console.error('Delete extra item error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
