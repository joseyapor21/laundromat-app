import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Order } from '@/lib/db/models';

// Format functions
function formatTimeASCII(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
  return `${hours}:${minutesStr} ${ampm}`;
}

function formatDateASCII(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

function formatDateWithWeekday(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekday = days[date.getDay()];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

function leftRightAlign(left: string, right: string, width = 48): string {
  const totalLen = left.length + right.length;
  if (totalLen >= width) return `${left} ${right}`;
  const padding = width - totalLen;
  return left + ' '.repeat(padding) + right;
}

function centerText(text: string, width = 48): string {
  if (text.length >= width) return text;
  const padding = Math.floor((width - text.length) / 2);
  return ' '.repeat(padding) + text;
}

function generatePreview(order: any): string {
  const createdDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const dateStr = formatDateASCII(createdDate);
  const timeStr = formatTimeASCII(createdDate);

  const orderNum = order.orderId?.toString() || '000';
  const isDelivery = order.orderType === 'delivery';
  const isSameDay = order.isSameDay;

  let lines: string[] = [];

  lines.push('');
  lines.push('════════════════════════════════════════════════');
  lines.push('           TICKET PREVIEW (NOT ACTUAL PRINT)     ');
  lines.push('════════════════════════════════════════════════');
  lines.push('');

  // Header
  lines.push(centerText(`██ ${isDelivery ? 'Pickup &' : 'In-Store'} ██  [DOUBLE SIZE INVERTED]`));
  lines.push(centerText(`██ ${isDelivery ? 'Delivery' : 'Pick Up'} ██  [DOUBLE SIZE INVERTED]`));
  if (isSameDay) {
    lines.push(centerText('██ SAME DAY ██  [DOUBLE SIZE INVERTED]'));
  }
  lines.push(centerText(`██ ${orderNum} ██  [DOUBLE SIZE INVERTED]`));
  lines.push('');

  // Created date/time
  lines.push(centerText(`▶ ${dateStr} ${timeStr} ◀  [DOUBLE HEIGHT - ORDER CREATED]`));
  lines.push('');

  // Store info
  lines.push(centerText('【E&F Laundromat】  [BOLD DOUBLE HEIGHT]'));
  lines.push(centerText('215-23 73rd Ave'));
  lines.push(centerText('Oakland Gardens, NY 11364'));
  lines.push(centerText('TEL (347) 204-1333'));
  lines.push('────────────────────────────────────────────────');

  // Customer info
  lines.push(centerText(`▶ ${order.customerName || 'Customer'} ◀  [DOUBLE HEIGHT]`));
  if (order.customer?.address) {
    lines.push(centerText(order.customer.address));
  }
  if (order.orderType !== 'delivery' && order.customerPhone) {
    lines.push(centerText(order.customerPhone));
  }

  // Notes
  if (order.specialInstructions) {
    const notes = (order.specialInstructions as string)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x00-\x7F]/g, '');
    lines.push('');
    lines.push(centerText('██ Notes : ██  [DOUBLE SIZE INVERTED]'));
    const maxLineLen = 20;
    for (let i = 0; i < notes.length; i += maxLineLen) {
      lines.push(centerText(`██ ${notes.substring(i, i + maxLineLen).trim()} ██`));
    }
  }

  lines.push('────────────────────────────────────────────────');

  // Laundry Order
  lines.push(centerText('【Laundry Order】  [BOLD]'));
  if (order.bags && order.bags.length > 0) {
    order.bags.forEach((bag: any) => {
      const bagName = bag.identifier || 'Bag';
      const bagWeight = bag.weight || 0;
      lines.push(leftRightAlign('Item', 'WEIGHT'));
      lines.push(leftRightAlign(bagName, `${bagWeight} LBS`));
      if (bag.description) {
        lines.push(`  → ${bag.description}`);
      }
    });
  } else {
    lines.push(leftRightAlign('Item', 'WEIGHT'));
    lines.push(leftRightAlign('Laundry', `${order.weight || 0} LBS`));
  }

  // Extra items
  if (order.extraItems && order.extraItems.length > 0) {
    lines.push('');
    lines.push(centerText('Extra Items'));
    order.extraItems.forEach((item: any) => {
      const itemName = item.name || item.item?.name || 'Extra Item';
      const itemTotal = Number((item.price * item.quantity).toFixed(2));
      lines.push(leftRightAlign(`${itemName} x${item.quantity}`, `$${itemTotal.toFixed(2)}`));
    });
  }

  lines.push('────────────────────────────────────────────────');

  // Totals
  lines.push(leftRightAlign('Weight', `${order.weight || 0} LBS`));
  if (order.subtotal && order.subtotal > 0) {
    lines.push(leftRightAlign('Subtotal', `$${order.subtotal.toFixed(2)}`));
  }
  if (order.deliveryFee && order.deliveryFee > 0) {
    lines.push(leftRightAlign('Delivery Fee', `$${order.deliveryFee.toFixed(2)}`));
  }
  if (order.sameDayFee && order.sameDayFee > 0) {
    lines.push(leftRightAlign('Same Day Fee', `$${order.sameDayFee.toFixed(2)}`));
  }
  if (order.creditApplied && order.creditApplied > 0) {
    lines.push(leftRightAlign('Credit Applied', `-$${order.creditApplied.toFixed(2)}`));
  }

  // Pickup info
  lines.push('');
  lines.push(centerText(`▶ ${isDelivery ? 'Delivery' : 'In-Store'} ◀  [DOUBLE HEIGHT]`));
  lines.push(centerText(`▶ ${isDelivery ? 'Service' : 'Pick Up'} ◀  [DOUBLE HEIGHT]`));

  // Pickup date/time (Ready By)
  if (order.estimatedPickupDate) {
    const pickupDate = new Date(order.estimatedPickupDate);
    const pickupDateStr = formatDateWithWeekday(pickupDate);
    const pickupTimeStr = formatTimeASCII(pickupDate);
    lines.push(centerText(`██ ${pickupDateStr} ██  [DOUBLE SIZE INVERTED - READY BY]`));
    lines.push(centerText(`██ ${pickupTimeStr} ██  [DOUBLE SIZE INVERTED]`));
  }

  // Total
  lines.push('');
  lines.push(centerText('▶ TOTAL ◀  [DOUBLE HEIGHT]'));
  lines.push(leftRightAlign(
    order.isPaid ? `Paid (${order.paymentMethod || 'Cash'})` : 'Cash on Pickup',
    `$${(order.totalAmount || 0).toFixed(2)}`
  ));

  // Remaining credit
  if (order.isPaid && order.customer?.credit && order.customer.credit > 0) {
    lines.push(centerText(`【Remaining Credit: $${order.customer.credit.toFixed(2)}】  [BOLD]`));
  }

  lines.push('');
  lines.push(centerText(`[QR CODE: ${orderNum}]`));
  lines.push('');
  lines.push('════════════════════════════════════════════════');
  lines.push('                    ✂ CUT ✂                     ');
  lines.push('════════════════════════════════════════════════');

  return lines.join('\n');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const { id } = await params;

    // Find order - try by orderId first, then by _id
    let order;
    if (/^\d+$/.test(id)) {
      order = await Order.findOne({ orderId: parseInt(id) }).populate('customer').lean();
    }
    if (!order) {
      order = await Order.findById(id).populate('customer').lean();
    }

    if (!order) {
      return new NextResponse('Order not found', { status: 404 });
    }

    const preview = generatePreview(order);

    return new NextResponse(preview, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error generating ticket preview:', error);
    return new NextResponse('Error generating preview', { status: 500 });
  }
}
