import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Settings, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import {
  initGmailClient,
  fetchPaymentEmails,
  markEmailAsProcessed,
  refreshTokensIfNeeded,
  GmailTokens,
} from '@/lib/services/gmailPayments';
import { processPayment, PaymentProcessResult } from '@/lib/services/paymentMatcher';

interface CheckEmailsResponse {
  success: boolean;
  message: string;
  processed: number;
  matched: number;
  results?: PaymentProcessResult[];
  error?: string;
}

/**
 * POST - Check Gmail for payment notification emails
 * Can be called by cron job (with API key) or by authenticated admin
 */
export async function POST(request: NextRequest): Promise<NextResponse<CheckEmailsResponse>> {
  try {
    // Check authentication - either API key or admin user
    const apiKey = request.headers.get('x-api-key');
    const expectedApiKey = process.env.PAYMENT_CHECK_API_KEY;

    let isAuthorized = false;
    let triggeredBy = 'unknown';

    if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
      isAuthorized = true;
      triggeredBy = 'cron';
    } else {
      const currentUser = await getCurrentUser();
      if (currentUser && ['super_admin', 'admin'].includes(currentUser.role)) {
        isAuthorized = true;
        triggeredBy = currentUser.name || currentUser.userId;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized', processed: 0, matched: 0 },
        { status: 401 }
      );
    }

    await connectDB();

    // Get Gmail tokens from settings
    const settings = await Settings.findOne();

    if (!settings) {
      return NextResponse.json(
        { success: false, message: 'Settings not found', processed: 0, matched: 0 },
        { status: 404 }
      );
    }

    // Check if Gmail is connected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsDoc = settings as any;

    if (!settingsDoc.gmailAccessToken || !settingsDoc.gmailRefreshToken) {
      return NextResponse.json(
        { success: false, message: 'Gmail not connected. Please connect Gmail in Admin settings.', processed: 0, matched: 0 },
        { status: 400 }
      );
    }

    // Prepare tokens
    let tokens: GmailTokens = {
      accessToken: settingsDoc.gmailAccessToken,
      refreshToken: settingsDoc.gmailRefreshToken,
      tokenExpiry: settingsDoc.gmailTokenExpiry || new Date(0),
    };

    // Refresh tokens if needed
    try {
      const refreshedTokens = await refreshTokensIfNeeded(tokens);

      // Save refreshed tokens if they changed
      if (refreshedTokens.accessToken !== tokens.accessToken) {
        settingsDoc.gmailAccessToken = refreshedTokens.accessToken;
        settingsDoc.gmailRefreshToken = refreshedTokens.refreshToken;
        settingsDoc.gmailTokenExpiry = refreshedTokens.tokenExpiry;
        await settingsDoc.save();
      }

      tokens = refreshedTokens;
    } catch (refreshError) {
      console.error('Failed to refresh Gmail tokens:', refreshError);
      return NextResponse.json(
        { success: false, message: 'Gmail authentication expired. Please reconnect Gmail.', processed: 0, matched: 0 },
        { status: 401 }
      );
    }

    // Initialize Gmail client
    const gmail = await initGmailClient(tokens);

    // Fetch payment emails
    const payments = await fetchPaymentEmails(gmail);

    if (payments.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new payment emails found',
        processed: 0,
        matched: 0,
      });
    }

    // Process each payment
    const results: PaymentProcessResult[] = [];
    let matchedCount = 0;

    for (const payment of payments) {
      const result = await processPayment(payment);
      results.push(result);

      if (result.match.success) {
        matchedCount++;
        // Mark email as processed
        try {
          await markEmailAsProcessed(gmail, payment.emailId);
        } catch (markError) {
          console.error('Failed to mark email as read:', markError);
        }
      }
    }

    // Log the check activity
    try {
      await ActivityLog.create({
        userId: 'system',
        userName: 'Payment System',
        action: 'payment_email_check',
        entityType: 'payment',
        entityId: 'batch',
        details: `Payment email check completed: ${payments.length} emails found, ${matchedCount} matched`,
        metadata: {
          triggeredBy,
          emailsFound: payments.length,
          matched: matchedCount,
          results: results.map(r => ({
            emailId: r.emailId,
            amount: r.payment.amount,
            sender: r.payment.senderName,
            method: r.payment.paymentMethod,
            matched: r.match.success,
            matchType: r.match.matchType,
          })),
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'cron',
        userAgent: request.headers.get('user-agent') || 'Payment Checker',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${payments.length} payment emails, ${matchedCount} matched to orders`,
      processed: payments.length,
      matched: matchedCount,
      results,
    });
  } catch (error) {
    console.error('Check emails error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'An error occurred',
        processed: 0,
        matched: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Check Gmail connection status
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !['super_admin', 'admin'].includes(currentUser.role)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();
    const settings = await Settings.findOne();

    if (!settings) {
      return NextResponse.json({ connected: false, message: 'Settings not found' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsDoc = settings as any;

    const connected = !!(settingsDoc.gmailAccessToken && settingsDoc.gmailRefreshToken);
    const expired = connected && settingsDoc.gmailTokenExpiry
      ? new Date(settingsDoc.gmailTokenExpiry) < new Date()
      : false;

    return NextResponse.json({
      connected,
      expired,
      message: connected
        ? (expired ? 'Gmail connected but token expired' : 'Gmail connected')
        : 'Gmail not connected',
    });
  } catch (error) {
    console.error('Check Gmail status error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
