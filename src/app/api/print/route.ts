import { NextRequest, NextResponse } from 'next/server';
import net from 'net';
import { verifyToken, getAuthCookie } from '@/lib/auth';
import Settings from '@/lib/db/models/Settings';
import connectDB from '@/lib/db/connection';

// Send print data to thermal printer via TCP with timeout
async function sendToPrinter(ip: string, port: number, content: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = 5000; // 5 second timeout for faster failover

    socket.setTimeout(timeout);

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Connection to ${ip}:${port} timed out`));
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(new Error(`Printer ${ip}:${port} error: ${err.message}`));
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

// Try printing with failover support
async function printWithFailover(
  primaryIp: string,
  backupIp: string | undefined,
  port: number,
  content: string,
  maxRetries: number = 3
): Promise<{ success: boolean; usedBackup: boolean; error?: string }> {
  const printers = [primaryIp];
  if (backupIp) printers.push(backupIp);

  for (const printerIp of printers) {
    const isBackup = printerIp === backupIp;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Print attempt ${attempt}/${maxRetries} to ${isBackup ? 'backup' : 'primary'} printer (${printerIp})`);
        await sendToPrinter(printerIp, port, content);
        return { success: true, usedBackup: isBackup };
      } catch (error) {
        console.error(`Print attempt ${attempt} failed:`, error);

        // If this was the last attempt for this printer, try next printer
        if (attempt === maxRetries) {
          console.log(`All ${maxRetries} attempts failed for ${printerIp}`);
        } else {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }

  return {
    success: false,
    usedBackup: false,
    error: `Print failed after trying ${printers.length} printer(s) with ${maxRetries} attempts each`
  };
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

    // Get printer settings
    await connectDB();
    const settings = await Settings.findOne();

    const primaryIp = printerIP || settings?.thermalPrinterIp;
    const backupIp = settings?.backupPrinterIp;
    const maxRetries = settings?.printRetryAttempts || 3;
    const port = printerPort || 9100;

    if (!primaryIp) {
      return NextResponse.json(
        { error: 'Printer IP not configured. Please set it in Admin > Settings.' },
        { status: 400 }
      );
    }

    // Send to printer with failover support
    const result = await printWithFailover(primaryIp, backupIp, port, content, maxRetries);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Print failed after all retry attempts' },
        { status: 500 }
      );
    }

    const message = result.usedBackup
      ? 'Print job sent to backup printer'
      : 'Print job sent successfully';

    return NextResponse.json({ success: true, message, usedBackup: result.usedBackup });
  } catch (error) {
    console.error('Print error:', error);
    return NextResponse.json(
      { error: `Print failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
