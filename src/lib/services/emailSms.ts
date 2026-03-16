import { google } from 'googleapis';
import { createOAuth2Client, initGmailClient, refreshTokensIfNeeded, GmailTokens } from './gmailPayments';
import { connectDB } from '@/lib/db/connection';
import { Settings } from '@/lib/db/models';

// Email-to-SMS gateways by carrier
// Only gateways with verified MX records (AT&T and Boost gateways are dead)
const SMS_GATEWAYS: Record<string, string> = {
  'tmobile': 'tmomail.net',
  'verizon': 'vtext.com',
  'cricket': 'mms.cricketwireless.net', // AT&T customers use Cricket gateway
  'att': 'mms.cricketwireless.net',     // AT&T own gateways are dead, Cricket (AT&T subsidiary) works
  'metro': 'mymetropcs.com',
  'sprint': 'tmomail.net',              // Sprint merged into T-Mobile
  'uscellular': 'email.uscc.net',
  'googlefi': 'msg.fi.google.com',
  'mint': 'tmomail.net',                // Mint uses T-Mobile network
  'visible': 'vtext.com',               // Visible uses Verizon network
  'boost': 'tmomail.net',               // Boost now on T-Mobile network
};

// Try these carriers in order — all have verified working MX records
const CARRIER_PRIORITY = ['tmobile', 'verizon', 'cricket', 'metro', 'uscellular', 'googlefi'];

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Remove leading 1 if 11 digits
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/**
 * Get Gmail client from stored settings
 */
async function getGmailClient() {
  await connectDB();
  const settings = await Settings.findOne();

  if (!settings?.gmailAccessToken || !settings?.gmailRefreshToken) {
    throw new Error('Gmail not connected. Please connect Gmail in admin settings.');
  }

  let tokens: GmailTokens = {
    accessToken: settings.gmailAccessToken,
    refreshToken: settings.gmailRefreshToken,
    tokenExpiry: settings.gmailTokenExpiry || new Date(0),
  };

  // Refresh if needed
  const refreshed = await refreshTokensIfNeeded(tokens);
  if (refreshed.accessToken !== tokens.accessToken) {
    settings.gmailAccessToken = refreshed.accessToken;
    settings.gmailRefreshToken = refreshed.refreshToken;
    settings.gmailTokenExpiry = refreshed.tokenExpiry;
    await settings.save();
  }

  const gmail = await initGmailClient(refreshed);
  return gmail;
}

/**
 * Send an email via Gmail API
 */
async function sendEmail(gmail: any, to: string, subject: string, body: string) {
  // Build raw email (no subject for SMS — just body)
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail,
    },
  });
}

/**
 * Send SMS via email-to-SMS gateway
 * If carrier is known, sends to that carrier's gateway
 * If carrier is unknown, tries the top 3 carriers (AT&T, T-Mobile, Verizon)
 */
export async function sendSmsViaEmail(
  phoneNumber: string,
  message: string,
  carrier?: string
): Promise<{ success: boolean; sentTo: string[]; error?: string }> {
  const phone = normalizePhone(phoneNumber);
  if (phone.length !== 10) {
    return { success: false, sentTo: [], error: 'Invalid phone number' };
  }

  try {
    const gmail = await getGmailClient();
    const sentTo: string[] = [];

    if (carrier && SMS_GATEWAYS[carrier]) {
      // Known carrier — send to one gateway
      const gateway = `${phone}@${SMS_GATEWAYS[carrier]}`;
      await sendEmail(gmail, gateway, '', message);
      sentTo.push(gateway);
    } else {
      // Unknown carrier — try top 3 (T-Mobile, Verizon, Cricket/AT&T cover ~90% of US)
      const topCarriers = ['tmobile', 'verizon', 'cricket'];
      for (const c of topCarriers) {
        const gateway = `${phone}@${SMS_GATEWAYS[c]}`;
        try {
          await sendEmail(gmail, gateway, '', message);
          sentTo.push(gateway);
        } catch (e) {
          console.error(`[EmailSMS] Failed to send to ${gateway}:`, e);
        }
      }
    }

    return { success: sentTo.length > 0, sentTo };
  } catch (error) {
    console.error('[EmailSMS] Error:', error);
    return {
      success: false,
      sentTo: [],
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    };
  }
}

/**
 * Get available carriers list
 */
export function getCarriers() {
  return Object.keys(SMS_GATEWAYS).map(key => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    gateway: SMS_GATEWAYS[key],
  }));
}
