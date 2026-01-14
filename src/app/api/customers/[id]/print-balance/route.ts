import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
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

    // Try to find by MongoDB _id or by numeric id
    let customer = await Customer.findById(id).lean();

    if (!customer) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        customer = await Customer.findOne({ id: numericId }).lean();
      }
    }

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Generate the print content for customer balance
    const printContent = generateCustomerBalancePrintContent({
      ...customer,
      _id: customer._id.toString(),
    });

    // Send to printer via print API
    const printResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://cloud.homation.us'}/api/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({ content: printContent }),
    });

    if (!printResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to print balance' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Customer balance printed successfully',
    });
  } catch (error) {
    console.error('Print customer balance error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// ESC/POS commands for thermal printer
const ESC = {
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
  FEED_AND_CUT: '\n\n\n\x1D\x56\x00',
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

interface CustomerData {
  _id: string;
  name: string;
  phoneNumber?: string;
  address?: string;
  credit?: number;
  creditHistory?: Array<{
    amount: number;
    type: 'add' | 'use';
    description: string;
    createdAt: Date;
  }>;
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

function leftRightAlign(left: string, right: string): string {
  const maxWidth = 48;
  const totalContentLength = left.length + right.length;
  if (totalContentLength >= maxWidth) {
    return `${left} ${right}`;
  }
  const padding = maxWidth - totalContentLength;
  return left + ' '.repeat(padding) + right;
}

function generateCustomerBalancePrintContent(customer: CustomerData): string {
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

  let r = '';

  // Initialize printer
  r += ESC.INIT;
  r += ESC.CENTER;

  // === HEADER ===
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ' CUSTOMER CREDIT \n';
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  r += '\n';

  // Date/Time
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${dateStr} ${timeStr}\n`;
  r += ESC.NORMAL_SIZE;

  // === STORE INFO ===
  r += ESC.BOLD_ON;
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${STORE_CONFIG.name}\n`;
  r += ESC.NORMAL_SIZE;
  r += ESC.BOLD_OFF;
  r += `${STORE_CONFIG.address}\n`;
  r += `${STORE_CONFIG.city}\n`;
  r += `TEL ${STORE_CONFIG.phone}\n`;
  r += '------------------------------------------------\n';

  // === CUSTOMER INFO ===
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${customer.name || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  r += `${customer.phoneNumber || ''}\n`;
  if (customer.address) {
    r += `${customer.address}\n`;
  }
  r += '------------------------------------------------\n';

  // === CREDIT BALANCE ===
  r += ESC.CENTER;
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.BOLD_ON;
  r += 'CREDIT BALANCE\n';
  r += ESC.INVERT_ON;
  r += ` $${(customer.credit || 0).toFixed(2)} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.BOLD_OFF;
  r += ESC.NORMAL_SIZE;
  r += '\n';

  // === RECENT CREDIT HISTORY (last 5 transactions) ===
  if (customer.creditHistory && customer.creditHistory.length > 0) {
    r += ESC.CENTER;
    r += ESC.BOLD_ON;
    r += 'Recent Transactions\n';
    r += ESC.BOLD_OFF;
    r += ESC.LEFT;

    const recentTransactions = customer.creditHistory.slice(-5).reverse();
    recentTransactions.forEach(tx => {
      const txDate = new Date(tx.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const amount = tx.type === 'add' ? `+$${tx.amount.toFixed(2)}` : `-$${tx.amount.toFixed(2)}`;
      r += leftRightAlign(txDate, amount) + '\n';
      if (tx.description) {
        const desc = tx.description.length > 30 ? tx.description.substring(0, 30) + '...' : tx.description;
        r += `  ${desc}\n`;
      }
    });
    r += '------------------------------------------------\n';
  }

  // === QR CODE (Links to customer profile) ===
  // Format: CUSTOMER:customerId
  const qrData = `CUSTOMER:${customer._id}`;
  r += generateQRCode(qrData, 12);

  r += ESC.CENTER;
  r += 'Scan QR to view full credit history\n';
  r += '\n';

  r += ESC.DOUBLE_HEIGHT_ON;
  r += 'Thank you for your business!\n';
  r += ESC.NORMAL_SIZE;

  r += '\n';
  r += ESC.FEED_AND_CUT;

  return r;
}
