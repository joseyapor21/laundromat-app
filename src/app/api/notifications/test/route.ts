import { NextRequest, NextResponse } from 'next/server';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import { sendPushNotification, getUsersWithPushTokens } from '@/lib/services/pushNotifications';

// GET - Check registered push tokens
export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    // Get all users with push tokens using our function
    const usersWithTokens = await getUsersWithPushTokens();

    // Also check the app User model directly
    await connectDB();
    const appUsersWithTokens = await User.find({
      pushToken: { $ne: null, $exists: true },
    }).select('email pushToken role').lean();

    // Also check the auth database directly (v5users collection)
    const db = await getAuthDatabase();
    const authUsersWithTokens = await db.collection('v5users')
      .find({ pushToken: { $ne: null, $exists: true } })
      .project({ email: 1, pushToken: 1 })
      .toArray();

    return NextResponse.json({
      usersWithPushTokens: usersWithTokens.length,
      users: usersWithTokens.map(u => ({
        email: u.email,
        role: u.role,
        tokenPrefix: u.pushToken.substring(0, 30) + '...',
      })),
      appModelUsers: appUsersWithTokens.map(u => ({
        email: u.email,
        role: u.role,
        token: u.pushToken?.substring(0, 30) + '...',
      })),
      authDatabaseUsers: authUsersWithTokens.map(u => ({
        email: u.email,
        token: u.pushToken?.substring(0, 30) + '...',
      })),
    });
  } catch (error) {
    console.error('Error checking push tokens:', error);
    return NextResponse.json({ error: 'Failed to check push tokens' }, { status: 500 });
  }
}

// POST - Send a test notification
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { token, title, body } = await request.json();

    if (!token) {
      // Send to all users
      const usersWithTokens = await getUsersWithPushTokens();

      if (usersWithTokens.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No users have push tokens registered. Make sure you are using a native build (not Expo Go).',
        });
      }

      const results = [];
      for (const user of usersWithTokens) {
        const notificationPayload = {
          to: user.pushToken,
          title: title || '🧺 Test Notification',
          body: body || 'Push notifications are working! You will receive order updates here.',
          sound: 'default' as const,
          channelId: 'orders',
          data: { type: 'test' },
        };
        console.log('Sending notification:', JSON.stringify(notificationPayload));
        const result = await sendPushNotification(notificationPayload);
        console.log('Notification result:', JSON.stringify(result));
        results.push({
          email: user.email,
          success: result.success,
          error: result.error,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Sent test notifications to ${usersWithTokens.length} users`,
        results,
      });
    }

    // Send to specific token
    const result = await sendPushNotification({
      to: token,
      title: title || 'Test Notification',
      body: body || 'This is a test notification.',
      sound: 'default',
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending test notification:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
