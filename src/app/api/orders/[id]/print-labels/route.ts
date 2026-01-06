import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, Settings } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { Socket } from 'net';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ESC/POS commands
const ESC = {
  FULL_CUT: '\x1D\x56\x00',
  FEED_AND_CUT: '\n\n\n\x1D\x56\x00',
  INIT: '\x1B\x40',
  INVERT_ON: '\x1D\x42\x01',
  INVERT_OFF: '\x1D\x42\x00',
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  DOUBLE_HEIGHT_ON: '\x1B\x21\x10',
  DOUBLE_SIZE_ON: '\x1B\x21\x30',
  NORMAL_SIZE: '\x1B\x21\x00',
  CENTER: '\x1B\x61\x01',
  LEFT: '\x1B\x61\x00',
  QR_MODEL: '\x1D\x28\x6B\x04\x00\x31\x41\x32\x00',
  QR_SIZE: (n: number) => `\x1D\x28\x6B\x03\x00\x31\x43${String.fromCharCode(n)}`,
  QR_ERROR_L: '\x1D\x28\x6B\x03\x00\x31\x45\x30',
  QR_STORE: (data: string) => {
    const len = data.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);
    return `\x1D\x28\x6B${String.fromCharCode(pL)}${String.fromCharCode(pH)}\x31\x50\x30${data}`;
  },
  QR_PRINT: '\x1D\x28\x6B\x03\x00\x31\x51\x30',
};

function leftRightAlign(left: string, right: string): string {
  const maxWidth = 48;
  const totalContentLength = left.length + right.length;
  if (totalContentLength >= maxWidth) {
    return `${left} ${right}`;
  }
  const padding = maxWidth - totalContentLength;
  return left + ' '.repeat(padding) + right;
}

function generateQRCode(data: string, size: number = 10): string {
  let qr = '';
  qr += '\n\n';
  qr += ESC.CENTER;
  qr += ESC.QR_MODEL;
  qr += ESC.QR_SIZE(size);
  qr += ESC.QR_ERROR_L;
  qr += ESC.QR_STORE(data);
  qr += ESC.QR_PRINT;
  qr += '\n\n';
  return qr;
}

interface Bag {
  identifier?: string;
  weight?: number;
  color?: string;
  description?: string;
}

function generateBagLabel(order: { orderId?: number; _id?: unknown; customerName?: string; customerPhone?: string; orderType?: string; estimatedPickupDate?: Date; specialInstructions?: string }, bag: Bag, bagNumber: number, totalBags: number): string {
  const orderNum = order.orderId?.toString() || String(order._id || '').slice(-6) || '000';
  const isDelivery = order.orderType === 'delivery';

  let r = '';

  r += ESC.INIT;
  r += ESC.CENTER;

  // BAG HEADER (inverted)
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ` BAG ${bagNumber} of ${totalBags} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  // Order number (large, inverted)
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ` #${orderNum} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  r += '\n';

  // CUSTOMER NAME (large)
  r += ESC.DOUBLE_SIZE_ON;
  r += `${order.customerName || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  r += `${order.customerPhone || ''}\n`;

  r += '------------------------------------------------\n';

  // ORDER TYPE
  r += ESC.DOUBLE_HEIGHT_ON;
  r += ESC.INVERT_ON;
  r += ` ${isDelivery ? 'DELIVERY' : 'IN-STORE PICKUP'} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  // Pickup date/time (large)
  if (order.estimatedPickupDate) {
    const pickupDate = new Date(order.estimatedPickupDate);
    const pickupDateStr = pickupDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
    });
    const pickupTimeStr = pickupDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` ${pickupDateStr} \n`;
    r += ` ${pickupTimeStr} \n`;
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
  }

  r += '------------------------------------------------\n';

  // BAG DETAILS
  r += ESC.LEFT;
  r += leftRightAlign('Bag ID:', bag.identifier || `Bag ${bagNumber}`) + '\n';
  r += leftRightAlign('Weight:', `${bag.weight || 'TBD'} LBS`) + '\n';
  if (bag.color) {
    r += leftRightAlign('Color:', bag.color) + '\n';
  }

  // Bag special instructions
  if (bag.description) {
    r += '\n';
    r += ESC.BOLD_ON;
    r += 'Bag Instructions:\n';
    r += ESC.BOLD_OFF;
    // Word wrap description to fit 48 char width
    const descWords = bag.description.split(' ');
    let line = '';
    for (const word of descWords) {
      if ((line + ' ' + word).trim().length <= 46) {
        line = (line + ' ' + word).trim();
      } else {
        if (line) r += `  ${line}\n`;
        line = word;
      }
    }
    if (line) r += `  ${line}\n`;
  }

  // Order Notes
  if (order.specialInstructions) {
    r += '\n';
    r += ESC.INVERT_ON;
    r += ` Order Notes: ${order.specialInstructions.substring(0, 30)} \n`;
    r += ESC.INVERT_OFF;
  }

  // QR CODE (Large for easy scanning)
  r += generateQRCode(orderNum, 10);
  r += '\n';

  r += ESC.CENTER;
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ` ATTACH TO BAG \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  r += '\n';
  r += ESC.FEED_AND_CUT;

  return r;
}

async function sendToPrinter(content: string, printerIP: string, printerPort: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Printer connection timeout'));
    }, 10000);

    socket.connect(printerPort, printerIP, () => {
      const buffer = Buffer.from(content, 'utf8');

      socket.write(buffer, () => {
        clearTimeout(timeout);
        socket.end();
        resolve();
      });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      socket.destroy();
      reject(err);
    });
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();
    const { id } = await params;

    // Check for bagIndex in request body
    let bagIndex: number | undefined;
    try {
      const body = await request.json();
      bagIndex = body.bagIndex;
    } catch {
      // No body or invalid JSON - print all bags
    }

    // Find the order
    let order = await Order.findById(id).lean();

    if (!order) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        order = await Order.findOne({ orderId: numericId }).lean();
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if order has bags
    if (!order.bags || order.bags.length === 0) {
      return NextResponse.json(
        { error: 'No bags found for this order' },
        { status: 400 }
      );
    }

    // Get printer settings
    const settings = await Settings.findOne().lean();

    if (!settings?.printerIP) {
      return NextResponse.json(
        { error: 'Printer not configured. Please set up printer IP in admin settings.' },
        { status: 400 }
      );
    }

    const printerIP = settings.printerIP;
    const printerPort = settings.printerPort || 9100;

    try {
      if (bagIndex !== undefined) {
        // Print single bag label
        if (bagIndex < 0 || bagIndex >= order.bags.length) {
          return NextResponse.json(
            { error: 'Invalid bag index' },
            { status: 400 }
          );
        }

        const bag = order.bags[bagIndex];
        const label = generateBagLabel(order, bag, bagIndex + 1, order.bags.length);
        await sendToPrinter(label, printerIP, printerPort);

        return NextResponse.json({
          message: `Bag ${bagIndex + 1} label printed successfully`,
          printer: { ip: printerIP, port: printerPort },
        });
      } else {
        // Print all bag labels
        for (let i = 0; i < order.bags.length; i++) {
          const bag = order.bags[i];
          const label = generateBagLabel(order, bag, i + 1, order.bags.length);
          await sendToPrinter(label, printerIP, printerPort);
        }

        return NextResponse.json({
          message: `${order.bags.length} bag label(s) printed successfully`,
          printer: { ip: printerIP, port: printerPort },
        });
      }
    } catch (printError) {
      console.error('Print error:', printError);
      return NextResponse.json(
        { error: `Printer error: ${printError instanceof Error ? printError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Print bag labels error:', error);
    return NextResponse.json(
      { error: 'An error occurred while printing bag labels' },
      { status: 500 }
    );
  }
}
