import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { TimeEntry, User } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

// GET - Get current user's clock-in status
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

    // Get user's clock status from User model
    const user = await User.findById(currentUser.userId).lean();

    // Get today's entries for this user
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayEntries = await TimeEntry.find({
      userId: currentUser.userId,
      timestamp: { $gte: today, $lt: tomorrow },
    })
      .sort({ timestamp: -1 })
      .lean();

    // Determine clock status from entries if user model not updated
    let isClockedIn = user?.isClockedIn || false;

    // Double-check with latest clock entry (ignore break entries for clock status)
    if (todayEntries.length > 0) {
      const latestClockEntry = todayEntries.find(e => e.type === 'clock_in' || e.type === 'clock_out');
      if (latestClockEntry) {
        isClockedIn = latestClockEntry.type === 'clock_in';
      }
    }

    // Determine break status from entries
    let isOnBreak = user?.isOnBreak || false;
    if (todayEntries.length > 0) {
      // Find the most recent break entry
      const latestBreakEntry = todayEntries.find(e => e.type === 'break_start' || e.type === 'break_end');
      if (latestBreakEntry) {
        isOnBreak = latestBreakEntry.type === 'break_start';
      }
    }

    return NextResponse.json({
      isClockedIn,
      isOnBreak,
      lastClockIn: user?.lastClockIn || null,
      lastClockOut: user?.lastClockOut || null,
      lastBreakStart: user?.lastBreakStart || null,
      lastBreakEnd: user?.lastBreakEnd || null,
      todayEntries: todayEntries.map(entry => ({
        _id: entry._id.toString(),
        type: entry.type,
        timestamp: entry.timestamp,
        location: entry.location,
      })),
    });
  } catch (error) {
    console.error('Get clock status error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
