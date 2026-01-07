import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Settings, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { exchangeCodeForTokens } from '@/lib/services/gmailPayments';

/**
 * GET - Handle Google OAuth callback
 * Exchange authorization code for tokens and store them
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      const errorDescription = searchParams.get('error_description') || 'Unknown error';
      console.error('Google OAuth error:', error, errorDescription);

      // Redirect to admin page with error
      const redirectUrl = new URL('/admin', request.url);
      redirectUrl.searchParams.set('gmail_error', errorDescription);
      return NextResponse.redirect(redirectUrl);
    }

    if (!code) {
      const redirectUrl = new URL('/admin', request.url);
      redirectUrl.searchParams.set('gmail_error', 'No authorization code received');
      return NextResponse.redirect(redirectUrl);
    }

    // Verify user is authenticated and is admin
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('message', 'Please login to connect Gmail');
      return NextResponse.redirect(redirectUrl);
    }

    if (!['super_admin', 'admin'].includes(currentUser.role)) {
      const redirectUrl = new URL('/admin', request.url);
      redirectUrl.searchParams.set('gmail_error', 'Only admins can connect Gmail');
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens in settings
    await connectDB();

    const settings = await Settings.findOne();

    if (!settings) {
      const redirectUrl = new URL('/admin', request.url);
      redirectUrl.searchParams.set('gmail_error', 'Settings not found');
      return NextResponse.redirect(redirectUrl);
    }

    // Update settings with Gmail tokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).gmailAccessToken = tokens.accessToken;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).gmailRefreshToken = tokens.refreshToken;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).gmailTokenExpiry = tokens.tokenExpiry;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).gmailConnectedAt = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings as any).gmailConnectedBy = currentUser.name || currentUser.userId;

    await settings.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'gmail_connected',
        entityType: 'settings',
        entityId: settings._id.toString(),
        details: 'Gmail account connected for payment notifications',
        metadata: {
          connectedBy: currentUser.name,
          tokenExpiry: tokens.tokenExpiry,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Redirect to admin page with success
    const redirectUrl = new URL('/admin', request.url);
    redirectUrl.searchParams.set('gmail_success', 'true');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);

    const redirectUrl = new URL('/admin', request.url);
    redirectUrl.searchParams.set(
      'gmail_error',
      error instanceof Error ? error.message : 'Failed to connect Gmail'
    );
    return NextResponse.redirect(redirectUrl);
  }
}
