// Ticket Preview Script - shows what a receipt would look like
// Run: node scripts/preview-ticket.mjs

// Sample order data for testing
const sampleOrder = {
  _id: '123456789',
  orderId: 534,
  orderType: 'delivery', // 'delivery' or 'in-store'
  isSameDay: true,
  customerName: 'John Smith',
  customerPhone: '+1-646-555-1234',
  customer: {
    address: '215-34 73rd Ave 2B',
    credit: 15.50
  },
  specialInstructions: "Don't use fabric softener. Separate whites and colors.",
  bags: [
    { identifier: 'Laundry BG', weight: 12, description: 'Mixed clothes' }
  ],
  weight: 12,
  subtotal: 16.80,
  deliveryFee: 3.00,
  sameDayFee: 4.00,
  creditApplied: 5.00,
  totalAmount: 18.80,
  isPaid: true,
  paymentMethod: 'Card',
  estimatedPickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
  createdAt: new Date('2025-01-30T14:30:00'),
};

// Format functions
function formatTimeASCII(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
  return `${hours}:${minutesStr} ${ampm}`;
}

function formatDateASCII(date) {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

function formatDateWithWeekday(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekday = days[date.getDay()];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

function leftRightAlign(left, right, width = 48) {
  const totalLen = left.length + right.length;
  if (totalLen >= width) return `${left} ${right}`;
  const padding = width - totalLen;
  return left + ' '.repeat(padding) + right;
}

function centerText(text, width = 48) {
  if (text.length >= width) return text;
  const padding = Math.floor((width - text.length) / 2);
  return ' '.repeat(padding) + text;
}

// Generate preview
function generatePreview(order) {
  const createdDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const dateStr = formatDateASCII(createdDate);
  const timeStr = formatTimeASCII(createdDate);

  const orderNum = order.orderId?.toString() || '000';
  const isDelivery = order.orderType === 'delivery';
  const isSameDay = order.isSameDay;

  let lines = [];

  lines.push('');
  lines.push('================================================');
  lines.push('');

  // Header
  lines.push(centerText(`[INVERTED] ${isDelivery ? 'Pickup &' : 'In-Store'}`));
  lines.push(centerText(`[INVERTED] ${isDelivery ? 'Delivery' : 'Pick Up'}`));
  if (isSameDay) {
    lines.push(centerText('[INVERTED] SAME DAY'));
  }
  lines.push(centerText(`[INVERTED] ${orderNum}`));
  lines.push('');

  // Created date/time (DOUBLE HEIGHT)
  lines.push(centerText(`[DOUBLE HEIGHT] ${dateStr} ${timeStr}`));
  lines.push('');

  // Store info
  lines.push(centerText('[BOLD DOUBLE HEIGHT] E&F Laundromat'));
  lines.push(centerText('215-23 73rd Ave'));
  lines.push(centerText('Oakland Gardens, NY 11364'));
  lines.push(centerText('TEL (347) 204-1333'));
  lines.push('------------------------------------------------');

  // Customer info
  lines.push(centerText(`[DOUBLE HEIGHT] ${order.customerName}`));
  if (order.customer?.address) {
    lines.push(centerText(order.customer.address));
  }
  if (order.orderType !== 'delivery' && order.customerPhone) {
    lines.push(centerText(order.customerPhone));
  }

  // Notes (DOUBLE SIZE)
  if (order.specialInstructions) {
    const notes = order.specialInstructions
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x00-\x7F]/g, '');
    lines.push('');
    lines.push(centerText('[DOUBLE SIZE INVERTED] Notes :'));
    const maxLineLen = 20;
    for (let i = 0; i < notes.length; i += maxLineLen) {
      lines.push(centerText(`[DOUBLE SIZE INVERTED] ${notes.substring(i, i + maxLineLen).trim()}`));
    }
  }

  lines.push('------------------------------------------------');

  // Laundry Order
  lines.push(centerText('[BOLD] Laundry Order'));
  if (order.bags && order.bags.length > 0) {
    order.bags.forEach((bag) => {
      const bagName = bag.identifier || 'Bag';
      const bagWeight = bag.weight || 0;
      lines.push(leftRightAlign('Item', 'WEIGHT'));
      lines.push(leftRightAlign(bagName, `${bagWeight} LBS`));
      if (bag.description) {
        lines.push(`  -> ${bag.description}`);
      }
    });
  }

  lines.push('------------------------------------------------');

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
  lines.push(centerText(`[DOUBLE HEIGHT] ${isDelivery ? 'Delivery' : 'In-Store'}`));
  lines.push(centerText(`[DOUBLE HEIGHT] ${isDelivery ? 'Service' : 'Pick Up'}`));

  // Pickup date/time (DOUBLE SIZE INVERTED)
  if (order.estimatedPickupDate) {
    const pickupDate = new Date(order.estimatedPickupDate);
    const pickupDateStr = formatDateWithWeekday(pickupDate);
    const pickupTimeStr = formatTimeASCII(pickupDate);
    lines.push(centerText(`[DOUBLE SIZE INVERTED] ${pickupDateStr}`));
    lines.push(centerText(`[DOUBLE SIZE INVERTED] ${pickupTimeStr}`));
  }

  // Total
  lines.push('');
  lines.push(centerText('[DOUBLE HEIGHT] TOTAL'));
  lines.push(leftRightAlign(
    order.isPaid ? `Paid (${order.paymentMethod || 'Cash'})` : 'Cash on Pickup',
    `$${(order.totalAmount || 0).toFixed(2)}`
  ));

  // Remaining credit
  if (order.isPaid && order.customer?.credit && order.customer.credit > 0) {
    lines.push(centerText(`[BOLD] Remaining Credit: $${order.customer.credit.toFixed(2)}`));
  }

  lines.push('');
  lines.push(centerText('[QR CODE: ' + orderNum + ']'));
  lines.push('');
  lines.push('================================================');
  lines.push('                  [CUT HERE]                    ');

  return lines.join('\n');
}

console.log('\n========== CUSTOMER RECEIPT PREVIEW ==========\n');
console.log(generatePreview(sampleOrder));

// Also test with in-store order
const inStoreOrder = {
  ...sampleOrder,
  orderId: 535,
  orderType: 'in-store',
  isSameDay: false,
  deliveryFee: 0,
  specialInstructions: "Extra starch on shirts",
  isPaid: false,
  customer: { ...sampleOrder.customer, credit: 0 }
};

console.log('\n\n========== IN-STORE ORDER PREVIEW ==========\n');
console.log(generatePreview(inStoreOrder));
