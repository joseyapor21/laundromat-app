import { NextResponse } from 'next/server';
import { removeAuthCookie } from '@/lib/auth';
import { connectDB } from '@/lib/db/connection';
import { ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (currentUser) {
      await connectDB();

      // Log the logout activity
      try {
        await ActivityLog.create({
          userId: currentUser.userId,
          userName: currentUser.name,
          action: 'logout',
          details: 'User logged out',
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }
    }

    // Remove the auth cookie
    await removeAuthCookie();

    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    // Still remove the cookie even if logging fails
    await removeAuthCookie();
    return NextResponse.json({ message: 'Logged out' });
  }
}
