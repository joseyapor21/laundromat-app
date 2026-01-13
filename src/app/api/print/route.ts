import { NextRequest, NextResponse } from 'next/server';
import net from 'net';
import { verifyToken, getAuthCookie } from '@/lib/auth';
import Settings from '@/lib/db/models/Settings';
import connectDB from '@/lib/db/connection';

// Send print data to thermal printer via TCP
async function sendToPrinter(ip: string, port: number, content: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = 10000; // 10 second timeout

    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timed out'));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.connect(port, ip, () => {
      // Write content directly - the content already includes ESC/POS init and cut commands
      socket.write(content, 'utf8');

      socket.end(() => {
        resolve(true);
      });
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication - check both cookie (web) and Bearer token (mobile)
    let token = await getAuthCookie();

    // If no cookie, check Authorization header (for mobile app)
    if (!token) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { content, printerIP, printerPort } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Get printer IP from settings if not provided
    let ip = printerIP;
    const port = printerPort || 9100;

    if (!ip) {
      await connectDB();
      const settings = await Settings.findOne();
      ip = settings?.thermalPrinterIp;

      if (!ip) {
        return NextResponse.json(
          { error: 'Printer IP not configured. Please set it in Admin > Settings.' },
          { status: 400 }
        );
      }
    }

    // Send to printer
    await sendToPrinter(ip, port, content);

    return NextResponse.json({ success: true, message: 'Print job sent successfully' });
  } catch (error) {
    console.error('Print error:', error);
    return NextResponse.json(
      { error: `Print failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
