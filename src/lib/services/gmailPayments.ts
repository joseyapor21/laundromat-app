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
  const seenEmailIds = new Set<string>(); // Track processed emails to avoid duplicates

  // Search queries for Zelle and Venmo payment notification emails
  // Check emails from the last 7 days (not just unread)
  // Include queries for forwarded emails (search by subject/content, not just from)
  const queries = [
    // Zelle queries - direct from Zelle
    'from:alerts@notify.zelle.com subject:"sent you" newer_than:7d',
    'from:alerts@notify.zelle.com subject:"received" newer_than:7d',
    // Zelle queries - TD Bank format
    'from:tdbank subject:"Zelle" subject:"deposited" newer_than:7d',
    'from:tdbank "Send Money with Zelle" newer_than:7d',
    // Zelle queries - Chase, Wells Fargo, Bank of America (common banks)
    'subject:"Zelle" subject:"payment" newer_than:7d',
    'subject:"Zelle" subject:"deposited" newer_than:7d',
    // Venmo queries - direct
    'from:venmo@venmo.com subject:"paid you" newer_than:7d',
    // Forwarded emails - search by subject pattern
    'subject:"paid you" subject:"Fwd:" newer_than:7d',
    'subject:"sent you" subject:"Fwd:" newer_than:7d',
    // Forwarded emails - search by content (Venmo/Zelle in body)
    '"venmo@venmo.com" subject:"paid you" newer_than:7d',
    '"notify.zelle.com" subject:"sent you" newer_than:7d',
  ];

  for (const query of queries) {
    try {
      console.log(`Searching Gmail with query: ${query}`);
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20,
      });

      const messages = response.data.messages || [];
      console.log(`Query "${query}" found ${messages.length} messages`);

      for (const message of messages) {
        if (!message.id) continue;

        // Skip if we've already processed this email
        if (seenEmailIds.has(message.id)) {
          console.log(`Skipping duplicate email: ${message.id}`);
          continue;
        }
        seenEmailIds.add(message.id);

        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const headers = fullMessage.data.payload?.headers || [];
        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
        const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        console.log(`Processing email - From: ${from}, Subject: ${subject}`);

        const parsed = parsePaymentEmail(fullMessage.data, message.id);
        if (parsed) {
          console.log(`Parsed payment: ${parsed.senderName} - $${parsed.amount} via ${parsed.paymentMethod}`);
          payments.push(parsed);
        } else {
          console.log(`Failed to parse payment from email`);
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
  // Check both 'from' header and body content (for forwarded emails)
  // Detect Zelle - from Zelle directly or from banks that use Zelle
  const isZelle = from.includes('zelle') ||
    from.includes('notify.zelle.com') ||
    body.includes('notify.zelle.com') ||
    body.includes('zelle.com') ||
    body.toLowerCase().includes('send money with zelle') ||
    body.toLowerCase().includes('zelle service') ||
    (subject.toLowerCase().includes('zelle') && body.toLowerCase().includes('payment'));
  const isVenmo = from.includes('venmo') || from.includes('venmo.com') || body.includes('venmo@venmo.com') || body.includes('venmo.com');

  if (isZelle) {
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

  if (isVenmo) {
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
 * Example formats:
 * - "John Smith sent you $25.00"
 * - "You received $50.00 from Jane Doe"
 * - TD Bank: "the $45.50 payment from MICHELLE CHACKO"
 * - "deposited the $XX.XX payment from [Name]"
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

  // Pattern 3: TD Bank format - "the $XX.XX payment from [Name]"
  // Also matches: "deposited the $45.50 payment from MICHELLE CHACKO"
  match = body.match(/(?:deposited\s+)?the\s+\$?([\d,]+\.?\d*)\s+payment\s+from\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/i);
  if (match) {
    return {
      senderName: match[2].trim(),
      amount: parseAmount(match[1]),
    };
  }

  // Pattern 4: Generic "payment from [Name]" with amount nearby
  match = body.match(/\$?([\d,]+\.?\d*)\s+(?:payment|transfer)\s+from\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/i);
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
