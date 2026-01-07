import { google, gmail_v1 } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
}

export interface ParsedPayment {
  senderName: string;
  amount: number;
  paymentMethod: 'zelle' | 'venmo';
  emailId: string;
  receivedAt: Date;
  rawSubject: string;
  rawBody: string;
}

/**
 * Create OAuth2 client for Gmail API
 */
export function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.NEXTAUTH_URL
    ? `${process.env.NEXTAUTH_URL}/api/auth/google/callback`
    : 'https://cloud.homation.us/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate OAuth2 authorization URL
 */
export function getAuthUrl(): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GmailTokens> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600000),
  };
}

/**
 * Initialize Gmail client with stored tokens
 */
export async function initGmailClient(tokens: GmailTokens): Promise<gmail_v1.Gmail> {
  const oauth2Client = createOAuth2Client();

  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.tokenExpiry.getTime(),
  });

  // Handle token refresh
  oauth2Client.on('tokens', (newTokens) => {
    console.log('Gmail tokens refreshed');
    // Note: Token refresh should be handled by the caller to persist new tokens
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Refresh access token if expired
 */
export async function refreshTokensIfNeeded(tokens: GmailTokens): Promise<GmailTokens> {
  const now = new Date();
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes buffer

  if (tokens.tokenExpiry.getTime() - now.getTime() > expiryBuffer) {
    return tokens; // Token still valid
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: tokens.refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  return {
    accessToken: credentials.access_token || tokens.accessToken,
    refreshToken: credentials.refresh_token || tokens.refreshToken,
    tokenExpiry: new Date(credentials.expiry_date || Date.now() + 3600000),
  };
}

/**
 * Fetch unread payment notification emails from Zelle and Venmo
 */
export async function fetchPaymentEmails(gmail: gmail_v1.Gmail): Promise<ParsedPayment[]> {
  const payments: ParsedPayment[] = [];

  // Search queries for Zelle and Venmo payment notification emails
  const queries = [
    // Zelle queries
    'from:alerts@notify.zelle.com subject:"sent you" is:unread',
    'from:alerts@notify.zelle.com subject:"received" is:unread',
    // Venmo queries
    'from:venmo@venmo.com subject:"paid you" is:unread',
  ];

  for (const query of queries) {
    try {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20,
      });

      const messages = response.data.messages || [];

      for (const message of messages) {
        if (!message.id) continue;

        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const parsed = parsePaymentEmail(fullMessage.data, message.id);
        if (parsed) {
          payments.push(parsed);
        }
      }
    } catch (error) {
      console.error(`Error fetching emails with query "${query}":`, error);
    }
  }

  return payments;
}

/**
 * Parse a Gmail message to extract payment information
 */
function parsePaymentEmail(message: gmail_v1.Schema$Message, emailId: string): ParsedPayment | null {
  const headers = message.payload?.headers || [];
  const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
  const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
  const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value;
  const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

  // Get email body
  let body = '';
  if (message.payload?.body?.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  } else if (message.payload?.parts) {
    const textPart = message.payload.parts.find(p => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
  }

  // Detect payment type and parse accordingly
  if (from.includes('zelle') || from.includes('notify.zelle.com')) {
    const parsed = parseZelleEmail(subject, body);
    if (parsed) {
      return {
        ...parsed,
        paymentMethod: 'zelle',
        emailId,
        receivedAt,
        rawSubject: subject,
        rawBody: body.substring(0, 500),
      };
    }
  }

  if (from.includes('venmo') || from.includes('venmo.com')) {
    const parsed = parseVenmoEmail(subject, body);
    if (parsed) {
      return {
        ...parsed,
        paymentMethod: 'venmo',
        emailId,
        receivedAt,
        rawSubject: subject,
        rawBody: body.substring(0, 500),
      };
    }
  }

  return null;
}

/**
 * Parse Zelle notification email
 * Example subjects:
 * - "John Smith sent you $25.00"
 * - "You received $50.00 from Jane Doe"
 */
function parseZelleEmail(subject: string, body: string): { senderName: string; amount: number } | null {
  // Pattern 1: "[Name] sent you $XX.XX"
  let match = subject.match(/^(.+?)\s+sent you\s+\$?([\d,]+\.?\d*)/i);
  if (match) {
    return {
      senderName: match[1].trim(),
      amount: parseAmount(match[2]),
    };
  }

  // Pattern 2: "You received $XX.XX from [Name]"
  match = subject.match(/received\s+\$?([\d,]+\.?\d*)\s+from\s+(.+)/i);
  if (match) {
    return {
      senderName: match[2].trim(),
      amount: parseAmount(match[1]),
    };
  }

  // Try parsing from body if subject didn't match
  match = body.match(/(.+?)\s+sent you\s+\$?([\d,]+\.?\d*)/i);
  if (match) {
    return {
      senderName: match[1].trim(),
      amount: parseAmount(match[2]),
    };
  }

  match = body.match(/received\s+\$?([\d,]+\.?\d*)\s+from\s+(.+?)[\.\n]/i);
  if (match) {
    return {
      senderName: match[2].trim(),
      amount: parseAmount(match[1]),
    };
  }

  return null;
}

/**
 * Parse Venmo notification email
 * Example subjects:
 * - "John Smith paid you $25.00"
 * - "You received $50.00"
 */
function parseVenmoEmail(subject: string, body: string): { senderName: string; amount: number } | null {
  // Pattern 1: "[Name] paid you $XX.XX"
  let match = subject.match(/^(.+?)\s+paid you\s+\$?([\d,]+\.?\d*)/i);
  if (match) {
    return {
      senderName: match[1].trim(),
      amount: parseAmount(match[2]),
    };
  }

  // Try parsing from body
  match = body.match(/(.+?)\s+paid you\s+\$?([\d,]+\.?\d*)/i);
  if (match) {
    return {
      senderName: match[1].trim(),
      amount: parseAmount(match[2]),
    };
  }

  // Pattern 2: "You received $XX.XX from [Name]"
  match = body.match(/received\s+\$?([\d,]+\.?\d*)\s+from\s+(.+?)[\.\n]/i);
  if (match) {
    return {
      senderName: match[2].trim(),
      amount: parseAmount(match[1]),
    };
  }

  return null;
}

/**
 * Parse amount string to number
 */
function parseAmount(amountStr: string): number {
  // Remove commas and parse as float
  return parseFloat(amountStr.replace(/,/g, ''));
}

/**
 * Mark email as read (processed)
 */
export async function markEmailAsProcessed(gmail: gmail_v1.Gmail, emailId: string): Promise<void> {
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
        addLabelIds: [],
      },
    });
  } catch (error) {
    console.error(`Failed to mark email ${emailId} as read:`, error);
    throw error;
  }
}

/**
 * Add a label to the email (for tracking processed payments)
 */
export async function labelEmailAsPaymentProcessed(gmail: gmail_v1.Gmail, emailId: string, labelId: string): Promise<void> {
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
  } catch (error) {
    console.error(`Failed to label email ${emailId}:`, error);
  }
}
