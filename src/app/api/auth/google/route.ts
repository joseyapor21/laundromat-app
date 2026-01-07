import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getAuthUrl } from '@/lib/services/gmailPayments';

/**
 * GET - Initiate Google OAuth flow for Gmail access
 * Only admins can connect Gmail
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!['super_admin', 'admin'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Only admins can connect Gmail' },
        { status: 403 }
      );
    }

    // Check if Google credentials are configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.' },
        { status: 500 }
      );
    }

    // Generate OAuth URL
    const authUrl = getAuthUrl();

    return NextResponse.json({
      authUrl,
      message: 'Redirect to this URL to authorize Gmail access',
    });
  } catch (error) {
    console.error('Google OAuth init error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Google OAuth' },
      { status: 500 }
    );
  }
}
