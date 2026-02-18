import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

// POST - Archive completed orders older than 2 days
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    // Calculate date 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Find and update all completed orders older than 2 days (exclude soft-deleted)
    const result = await Order.updateMany(
      {
        status: 'completed',
        updatedAt: { $lt: twoDaysAgo },
        deletedAt: { $eq: null },
      },
      {
        $set: { status: 'archived' },
      }
    );

    return NextResponse.json({
      success: true,
      archivedCount: result.modifiedCount,
      message: `Archived ${result.modifiedCount} orders`,
    });
  } catch (error) {
    console.error('Archive orders error:', error);
    return NextResponse.json(
      { error: 'Failed to archive orders' },
      { status: 500 }
    );
  }
}

// GET - Get count of orders that would be archived
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await connectDB();

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const count = await Order.countDocuments({
      status: 'completed',
      updatedAt: { $lt: twoDaysAgo },
      deletedAt: { $eq: null },
    });

    return NextResponse.json({
      pendingArchiveCount: count,
      cutoffDate: twoDaysAgo,
    });
  } catch (error) {
    console.error('Get archive count error:', error);
    return NextResponse.json(
      { error: 'Failed to get archive count' },
      { status: 500 }
    );
  }
}
