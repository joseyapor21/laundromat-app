import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, Settings, Customer, PrintJob } from '@/lib/db/models';
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
  DOUBLE_WIDTH_ON: '\x1B\x21\x20',
  DOUBLE_SIZE_ON: '\x1B\x21\x30',
  NORMAL_SIZE: '\x1B\x21\x00',
  CENTER: '\x1B\x61\x01',
  LEFT: '\x1B\x61\x00',
  RIGHT: '\x1B\x61\x02',
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

const STORE_CONFIG = {
  name: 'E&F Laundromat',
  address: '215-23 73rd Ave',
  city: 'Oakland Gardens, NY 11364',
  phone: '(347) 204-1333',
};

function centerText(text: string): string {
  const maxWidth = 48;
  if (text.length >= maxWidth) return text;
  const padding = Math.floor((maxWidth - text.length) / 2);
  return ' '.repeat(padding) + text;
}

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

function generateReceipt(order: any, isStoreCopy: boolean = false): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).replace(/\//g, '-');
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const orderNum = order.orderId?.toString() || order._id?.slice(-6) || '000';
  const isDelivery = order.orderType === 'delivery';

  let r = '';
  r += ESC.INIT;
  r += ESC.CENTER;

  // Store copy header
  if (isStoreCopy) {
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ' STORE COPY \n';
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
    r += '\n';
  }

  // Header
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ` ${isDelivery ? 'Pickup &' : 'In-Store'} \n`;
  r += ` ${isDelivery ? 'Delivery' : 'Pick Up'} \n`;
  if (order.isSameDay) {
    r += ' SAME DAY \n';
  }
  r += ESC.INVERT_OFF;

  // Order number
  r += ESC.INVERT_ON;
  r += ` ${orderNum} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  r += '\n';
  // Date/Time (BIGGER)
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${dateStr} ${timeStr}\n`;
  r += ESC.NORMAL_SIZE;

  // Store info
  r += ESC.BOLD_ON;
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${STORE_CONFIG.name}\n`;
  r += ESC.NORMAL_SIZE;
  r += ESC.BOLD_OFF;
  r += `${STORE_CONFIG.address}\n`;
  r += `${STORE_CONFIG.city}\n`;
  r += `TEL ${STORE_CONFIG.phone}\n`;
  r += '------------------------------------------------\n';

  // Customer info
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${order.customerName || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  // Customer address (if available)
  if (order.customer?.address) {
    r += `${order.customer.address}\n`;
  }
  r += `${order.customerPhone || ''}\n`;

  if (order.specialInstructions) {
    r += ESC.INVERT_ON;
    r += ` Notes : \n`;
    r += ` ${order.specialInstructions.substring(0, 20)} \n`;
    r += ESC.INVERT_OFF;
  }

  r += '------------------------------------------------\n';

  // Order details
  r += ESC.CENTER;
  r += ESC.BOLD_ON;
  r += 'Laundry Order\n';
  r += ESC.BOLD_OFF;
  r += ESC.LEFT;

  // Show bags if available
  if (order.bags && order.bags.length > 0) {
    order.bags.forEach((bag: any, index: number) => {
      const bagName = bag.identifier || `Bag ${index + 1}`;
      const bagWeight = bag.weight || 0;
      r += leftRightAlign('Item', 'WEIGHT') + '\n';
      r += leftRightAlign(bagName, `${bagWeight} LBS`) + '\n';
      if (isStoreCopy && bag.color) {
        r += `  Color: ${bag.color}\n`;
      }
    });
  } else {
    r += leftRightAlign('Item', 'WEIGHT') + '\n';
    r += leftRightAlign('Laundry', `${order.weight || 0} LBS`) + '\n';
  }

  r += '------------------------------------------------\n';

  // Total
  r += ESC.LEFT;
  const totalWeight = order.weight || 0;
  r += leftRightAlign('Total Weight', `${totalWeight} LBS`) + '\n';

  r += '\n';
  r += ESC.CENTER;
  r += ESC.DOUBLE_HEIGHT_ON;
  r += 'TOTAL\n';
  r += ESC.NORMAL_SIZE;
  r += ESC.LEFT;
  r += leftRightAlign(
    order.isPaid ? `Paid (${order.paymentMethod || 'Cash'})` : 'Cash on Pickup',
    `$${(order.totalAmount || 0).toFixed(2)}`
  ) + '\n';

  // QR Code
  r += generateQRCode(orderNum, 12);
  r += '\n';

  // Footer for store copy
  if (isStoreCopy) {
    r += ESC.CENTER;
    r += ESC.INVERT_ON;
    r += ' STORE COPY - KEEP FOR RECORDS \n';
    r += ESC.INVERT_OFF;
    r += '\n';
  }

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

    // Get print type from request body (customer, store, or both)
    let printType: 'customer' | 'store' | 'both' = 'both';
    try {
      const body = await request.json();
      if (body.type === 'customer' || body.type === 'store' || body.type === 'both') {
        printType = body.type;
      }
    } catch {
      // No body or invalid JSON, default to 'both'
    }

    // Find the order
    let order: any = await Order.findById(id).lean();

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

    // Fetch customer data separately (customerId is stored as a string, not ObjectId)
    if (order.customerId) {
      const customer = await Customer.findById(order.customerId).lean();
      if (customer) {
        order.customer = customer;
      }
    }

    // Queue print jobs for the local print agent to process
    const jobIds: string[] = [];

    if (printType === 'customer' || printType === 'both') {
      const customerReceipt = generateReceipt(order, false);
      const job = new PrintJob({
        content: customerReceipt,
        printerId: 'main',
        priority: 'high',
        status: 'pending',
      });
      await job.save();
      jobIds.push(job._id.toString());
    }

    if (printType === 'store' || printType === 'both') {
      const storeReceipt = generateReceipt(order, true);
      const job = new PrintJob({
        content: storeReceipt,
        printerId: 'main',
        priority: 'high',
        status: 'pending',
      });
      await job.save();
      jobIds.push(job._id.toString());
    }

    const message = printType === 'both'
      ? 'Both receipts queued for printing'
      : printType === 'customer'
        ? 'Customer receipt queued for printing'
        : 'Store copy queued for printing';

    return NextResponse.json({
      message,
      jobIds,
    });
  } catch (error) {
    console.error('Print order error:', error);
    return NextResponse.json(
      { error: 'An error occurred while printing' },
      { status: 500 }
    );
  }
}
