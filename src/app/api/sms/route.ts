import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { sendSmsViaEmail, getCarriers } from '@/lib/services/emailSms';

// POST - Send SMS to a customer
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { phoneNumber, message, carrier } = await request.json();

    if (!phoneNumber || !message) {
      return NextResponse.json(
        { error: 'phoneNumber and message are required' },
        { status: 400 }
      );
    }

    if (message.length > 160) {
      return NextResponse.json(
        { error: 'Message must be 160 characters or less for SMS' },
        { status: 400 }
      );
    }

    console.log(`[SMS] ${currentUser.name} sending to ${phoneNumber}: "${message}"`);

    const result = await sendSmsViaEmail(phoneNumber, message, carrier);

    if (result.success) {
      return NextResponse.json({
        success: true,
        sentTo: result.sentTo,
        carrier: carrier || 'unknown (sent to top 3)',
      });
    }

    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  } catch (error) {
    console.error('SMS API error:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}

// GET - Get available carriers
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json({ carriers: getCarriers() });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get carriers' }, { status: 500 });
  }
}
