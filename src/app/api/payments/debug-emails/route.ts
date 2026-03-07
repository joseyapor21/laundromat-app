import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Settings } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import {
  initGmailClient,
  refreshTokensIfNeeded,
  GmailTokens,
} from '@/lib/services/gmailPayments';

/**
 * GET - Debug endpoint to see recent emails in connected Gmail
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !['super_admin', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const settings = await Settings.findOne();

    if (!settings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsDoc = settings as any;

    if (!settingsDoc.gmailAccessToken || !settingsDoc.gmailRefreshToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
    }

    let tokens: GmailTokens = {
      accessToken: settingsDoc.gmailAccessToken,
      refreshToken: settingsDoc.gmailRefreshToken,
      tokenExpiry: settingsDoc.gmailTokenExpiry || new Date(0),
    };

    // Refresh tokens if needed
    tokens = await refreshTokensIfNeeded(tokens);
    const gmail = await initGmailClient(tokens);

    // Get profile to see which email is connected
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const connectedEmail = profile.data.emailAddress;

    // Search for recent emails with payment-related terms
    const searchQueries = [
      { name: 'All recent', query: 'newer_than:7d' },
      { name: 'Venmo direct', query: 'from:venmo@venmo.com newer_than:30d' },
      { name: 'Zelle direct', query: 'from:notify.zelle.com newer_than:30d' },
      { name: 'Subject: paid you', query: 'subject:"paid you" newer_than:30d' },
      { name: 'Subject: sent you', query: 'subject:"sent you" newer_than:30d' },
      { name: 'Body contains venmo', query: '"venmo" newer_than:7d' },
      { name: 'Forwarded', query: 'subject:"Fwd:" newer_than:7d' },
    ];

    const results: Array<{ query: string; count: number; samples: string[] }> = [];

    for (const sq of searchQueries) {
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: sq.query,
          maxResults: 5,
        });

        const messages = response.data.messages || [];
        const samples: string[] = [];

        for (const msg of messages.slice(0, 3)) {
          if (!msg.id) continue;
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
          });
          const headers = full.data.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
          const from = headers.find(h => h.name === 'From')?.value || '(unknown)';
          samples.push(`${from}: ${subject}`);
        }

        results.push({
          query: sq.name,
          count: messages.length,
          samples,
        });
      } catch (e) {
        results.push({
          query: sq.name,
          count: -1,
          samples: [`Error: ${e instanceof Error ? e.message : 'unknown'}`],
        });
      }
    }

    return NextResponse.json({
      connectedEmail,
      totalMessages: profile.data.messagesTotal,
      searches: results,
    });
  } catch (error) {
    console.error('Debug emails error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
