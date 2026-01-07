import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Settings, ActivityLog } from '@/lib/db/models';
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

    // Get settings (should be a single document)
    let settings = await Settings.findOne().lean();

    // Create default settings if none exist
    if (!settings) {
      const defaultSettings = new Settings({
        minimumWeight: 8,
        minimumPrice: 8,
        pricePerPound: 1.25,
        deliveryFee: 3,
        updatedBy: 'system',
      });
      await defaultSettings.save();
      // Fetch the saved document as lean
      settings = await Settings.findById(defaultSettings._id).lean();
    }

    if (!settings) {
      return NextResponse.json(
        { error: 'Failed to get settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...settings,
      _id: settings._id.toString(),
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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

    const updates = await request.json();

    // Find or create settings
    let settings = await Settings.findOne();

    if (!settings) {
      settings = new Settings({
        ...updates,
        updatedBy: currentUser.userId,
        updatedAt: new Date(),
      });
    } else {
      Object.assign(settings, updates, {
        updatedBy: currentUser.userId,
        updatedAt: new Date(),
      });
    }

    await settings.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_settings',
        entityType: 'settings',
        entityId: settings._id.toString(),
        details: 'Updated system settings',
        metadata: { updates: Object.keys(updates) },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      ...settings.toObject(),
      _id: settings._id.toString(),
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
