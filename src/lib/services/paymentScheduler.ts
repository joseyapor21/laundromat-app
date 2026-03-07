/**
 * Payment Scheduler - Automatically checks Gmail for payment emails
 * Runs every 5 minutes when the server is active
 */

import { connectDB } from '@/lib/db/connection';
import { Settings, ActivityLog } from '@/lib/db/models';
import {
  initGmailClient,
  fetchPaymentEmails,
  markEmailAsProcessed,
  refreshTokensIfNeeded,
  GmailTokens,
} from './gmailPayments';
import { processPayment } from './paymentMatcher';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Start the payment checker interval
 */
export function startPaymentChecker() {
  if (intervalId) {
    console.log('[PaymentScheduler] Already running');
    return;
  }

  console.log('[PaymentScheduler] Starting automatic payment checker (every 5 minutes)');

  // Run immediately on startup (after a short delay to let DB connect)
  setTimeout(() => {
    checkPaymentEmails();
  }, 30000); // Wait 30 seconds after server start

  // Then run every 5 minutes
  intervalId = setInterval(() => {
    checkPaymentEmails();
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the payment checker
 */
export function stopPaymentChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[PaymentScheduler] Stopped');
  }
}

/**
 * Check Gmail for payment emails
 */
async function checkPaymentEmails() {
  // Prevent concurrent runs
  if (isRunning) {
    console.log('[PaymentScheduler] Skipping - already running');
    return;
  }

  isRunning = true;
  console.log('[PaymentScheduler] Checking for payment emails...');

  try {
    await connectDB();

    // Get Gmail tokens from settings
    const settings = await Settings.findOne();

    if (!settings) {
      console.log('[PaymentScheduler] No settings found');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsDoc = settings as any;

    if (!settingsDoc.gmailAccessToken || !settingsDoc.gmailRefreshToken) {
      console.log('[PaymentScheduler] Gmail not connected');
      return;
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
        console.log('[PaymentScheduler] Tokens refreshed');
      }

      tokens = refreshedTokens;
    } catch (refreshError) {
      console.error('[PaymentScheduler] Failed to refresh tokens:', refreshError);
      return;
    }

    // Initialize Gmail client
    const gmail = await initGmailClient(tokens);

    // Fetch payment emails
    const payments = await fetchPaymentEmails(gmail);

    if (payments.length === 0) {
      console.log('[PaymentScheduler] No payment emails found');
      return;
    }

    console.log(`[PaymentScheduler] Found ${payments.length} payment emails`);

    // Process each payment
    let matchedCount = 0;

    for (const payment of payments) {
      const result = await processPayment(payment);

      if (result.match.success) {
        matchedCount++;
        // Mark email as processed
        try {
          await markEmailAsProcessed(gmail, payment.emailId);
        } catch (markError) {
          console.error('[PaymentScheduler] Failed to mark email as read:', markError);
        }
      }
    }

    console.log(`[PaymentScheduler] Processed ${payments.length} emails, ${matchedCount} matched`);

    // Log the check activity
    try {
      await ActivityLog.create({
        userId: 'system',
        userName: 'Payment Scheduler',
        action: 'payment_email_check',
        entityType: 'payment',
        entityId: 'scheduled',
        details: `Scheduled payment check: ${payments.length} emails found, ${matchedCount} matched`,
        metadata: {
          triggeredBy: 'scheduler',
          emailsFound: payments.length,
          matched: matchedCount,
        },
        ipAddress: 'server',
        userAgent: 'PaymentScheduler',
      });
    } catch (logError) {
      console.error('[PaymentScheduler] Failed to log activity:', logError);
    }
  } catch (error) {
    console.error('[PaymentScheduler] Error checking payments:', error);
  } finally {
    isRunning = false;
  }
}
