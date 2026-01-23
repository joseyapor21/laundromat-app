import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { TimeEntry, User, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import fs from 'fs/promises';
import path from 'path';

// GET - List time entries (admin only)
export async function GET(request: NextRequest) {
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

    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build query
    const query: Record<string, unknown> = {};

    if (userId) {
      query.userId = userId;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        (query.timestamp as Record<string, Date>).$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        (query.timestamp as Record<string, Date>).$lte = end;
      }
    }

    const [entries, total] = await Promise.all([
      TimeEntry.find(query)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      TimeEntry.countDocuments(query),
    ]);

    return NextResponse.json({ entries, total });
  } catch (error) {
    console.error('Get time entries error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// POST - Create clock in/out entry
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const body = await request.json();
    const { type, photo, location, notes, deviceInfo } = body;

    // Validate required fields
    if (!type || !['clock_in', 'clock_out'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be clock_in or clock_out' },
        { status: 400 }
      );
    }

    if (!photo) {
      return NextResponse.json(
        { error: 'Photo is required' },
        { status: 400 }
      );
    }

    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      return NextResponse.json(
        { error: 'Valid location with latitude and longitude is required' },
        { status: 400 }
      );
    }

    // Get user initials
    const nameParts = currentUser.name.split(' ');
    const initials = nameParts.length >= 2
      ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
      : currentUser.name.substring(0, 2).toUpperCase();

    // Save photo to file system
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const timestamp = now.getTime();
    const fileName = `${currentUser.userId}_${timestamp}_${type}.jpg`;
    const relativePath = `time-entries/${yearMonth}/${fileName}`;

    // Create directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'time-entries', yearMonth);
    await fs.mkdir(uploadDir, { recursive: true });

    // Save the photo (base64 to file)
    const photoBuffer = Buffer.from(photo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, photoBuffer);

    // Create time entry
    const timeEntry = await TimeEntry.create({
      userId: currentUser.userId,
      userName: currentUser.name,
      userInitials: initials,
      type,
      timestamp: now,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        address: location.address,
      },
      photoPath: relativePath,
      deviceInfo,
      notes,
    });

    // Update user's clock status
    const userUpdate: Record<string, unknown> = {
      isClockedIn: type === 'clock_in',
    };
    if (type === 'clock_in') {
      userUpdate.lastClockIn = now;
    } else {
      userUpdate.lastClockOut = now;
    }

    await User.findByIdAndUpdate(currentUser.userId, userUpdate);

    // Log activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: type === 'clock_in' ? 'clock_in' : 'clock_out',
        entityType: 'time_entry',
        entityId: timeEntry._id.toString(),
        details: `${currentUser.name} ${type === 'clock_in' ? 'clocked in' : 'clocked out'}`,
        metadata: {
          location,
          hasPhoto: true,
        },
        ipAddress: request.headers.get('x-forwarded-for') || '',
        userAgent: request.headers.get('user-agent') || '',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json(timeEntry, { status: 201 });
  } catch (error) {
    console.error('Create time entry error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
