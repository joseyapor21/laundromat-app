import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Settings } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { Socket } from 'net';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const { content } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Print content is required' },
        { status: 400 }
      );
    }

    // Get printer settings
    const settings = await Settings.findOne().lean();

    if (!settings?.printerIP) {
      return NextResponse.json(
        { error: 'Printer not configured' },
        { status: 400 }
      );
    }

    const printerIP = settings.printerIP;
    const printerPort = settings.printerPort || 9100;

    // Send to thermal printer via socket
    return new Promise<NextResponse>((resolve) => {
      const socket = new Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(NextResponse.json(
          { error: 'Printer connection timeout' },
          { status: 504 }
        ));
      }, 10000);

      socket.connect(printerPort, printerIP, () => {
        // Convert content to ESC/POS format
        const buffer = Buffer.from(content, 'utf8');

        socket.write(buffer, () => {
          clearTimeout(timeout);
          socket.end();
          resolve(NextResponse.json({
            message: 'Print job sent successfully',
            printer: { ip: printerIP, port: printerPort },
          }));
        });
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(NextResponse.json(
          { error: `Printer error: ${err.message}` },
          { status: 500 }
        ));
      });
    });
  } catch (error) {
    console.error('Print error:', error);
    return NextResponse.json(
      { error: 'An error occurred while printing' },
      { status: 500 }
    );
  }
}
