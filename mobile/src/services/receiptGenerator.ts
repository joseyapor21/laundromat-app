import type { Order, Bag } from '../types';

// ESC/POS commands
const ESC = {
  // Paper cutting
  FULL_CUT: '\x1D\x56\x00',
  PARTIAL_CUT: '\x1D\x56\x01',
  FEED_AND_CUT: '\n\n\n\x1D\x56\x00',

  // Text formatting
  INIT: '\x1B\x40',                    // Initialize printer
  INVERT_ON: '\x1D\x42\x01',           // White text on black background
  INVERT_OFF: '\x1D\x42\x00',          // Normal text
  BOLD_ON: '\x1B\x45\x01',             // Bold on
  BOLD_OFF: '\x1B\x45\x00',            // Bold off
  DOUBLE_HEIGHT_ON: '\x1B\x21\x10',    // Double height
  DOUBLE_WIDTH_ON: '\x1B\x21\x20',     // Double width
  DOUBLE_SIZE_ON: '\x1B\x21\x30',      // Double width + height
  NORMAL_SIZE: '\x1B\x21\x00',         // Normal size
  CENTER: '\x1B\x61\x01',              // Center align
  LEFT: '\x1B\x61\x00',                // Left align
  RIGHT: '\x1B\x61\x02',               // Right align

  // QR Code commands (GS ( k)
  QR_MODEL: '\x1D\x28\x6B\x04\x00\x31\x41\x32\x00',     // Set QR model 2
  QR_SIZE: (n: number) => `\x1D\x28\x6B\x03\x00\x31\x43${String.fromCharCode(n)}`, // Set QR size (3-16)
  QR_ERROR_L: '\x1D\x28\x6B\x03\x00\x31\x45\x30',       // Error correction L
  QR_STORE: (data: string) => {
    const len = data.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);
    return `\x1D\x28\x6B${String.fromCharCode(pL)}${String.fromCharCode(pH)}\x31\x50\x30${data}`;
  },
  QR_PRINT: '\x1D\x28\x6B\x03\x00\x31\x51\x30',         // Print QR code
};

// Store configuration
const STORE_CONFIG = {
  name: 'E&F Laundromat',
  address: '215-23 73rd Ave',
  city: 'Oakland Gardens, NY 11364',
  phone: '(347) 204-1333',
};

const cutCommand = ESC.FEED_AND_CUT;

// Utility functions
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

// Generate QR code ESC/POS commands
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

// Generate customer receipt
export function generateCustomerReceiptText(order: Order): string {
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
  const isSameDay = order.isSameDay;

  let r = '';

  // Initialize printer
  r += ESC.INIT;
  r += ESC.CENTER;

  // === HEADER: Order Type (inverted) ===
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ` ${isDelivery ? 'Pickup &' : 'In-Store'} \n`;
  r += ` ${isDelivery ? 'Delivery' : 'Pick Up'} \n`;
  if (isSameDay) {
    r += ' SAME DAY \n';
  }
  r += ESC.INVERT_OFF;

  // Order number (inverted)
  r += ESC.INVERT_ON;
  r += ` ${orderNum} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  r += '\n';

  // Date/Time (BIGGER)
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
  r += `${order.customerName || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  if (order.customer?.address) {
    r += `${order.customer.address}\n`;
  }
  r += `${order.customerPhone || ''}\n`;

  // Notes (inverted if present)
  if (order.specialInstructions) {
    r += ESC.INVERT_ON;
    r += ` Notes : \n`;
    r += ` ${order.specialInstructions.substring(0, 20)} \n`;
    r += ESC.INVERT_OFF;
  }

  r += '------------------------------------------------\n';

  // === LAUNDRY ORDER SECTION ===
  r += ESC.CENTER;
  r += ESC.BOLD_ON;
  r += 'Laundry Order\n';
  r += ESC.BOLD_OFF;
  r += ESC.LEFT;

  // Items with weight
  if (order.bags && order.bags.length > 0) {
    order.bags.forEach((bag, index) => {
      const bagName = bag.identifier || `Bag ${index + 1}`;
      const bagWeight = bag.weight || 0;
      r += leftRightAlign(`Item`, 'WEIGHT');
      r += '\n';
      r += leftRightAlign(`${bagName}`, `${bagWeight} LBS`);
      r += '\n';
    });
  } else {
    r += leftRightAlign('Item', 'WEIGHT') + '\n';
    r += leftRightAlign('Laundry', `${order.weight || 0} LBS`) + '\n';
  }

  // Extra items (if any)
  if (order.extraItems && order.extraItems.length > 0) {
    r += '\n';
    r += ESC.CENTER;
    r += 'Extra Items\n';
    r += ESC.LEFT;
    order.extraItems.forEach(item => {
      r += leftRightAlign(`${item.name} x${item.quantity}`, `$${(item.price * item.quantity).toFixed(2)}`) + '\n';
    });
  }

  r += '------------------------------------------------\n';

  // === TOTALS SECTION ===
  r += ESC.LEFT;
  const totalWeight = order.weight || 0;

  // Show subtotal breakdown
  r += leftRightAlign('Weight', `${totalWeight} LBS`) + '\n';
  r += leftRightAlign('Subtotal', `$${(order.subtotal || 0).toFixed(2)}`) + '\n';

  // Show delivery fee if applicable
  if (order.deliveryFee && order.deliveryFee > 0) {
    r += leftRightAlign('Delivery Fee', `$${order.deliveryFee.toFixed(2)}`) + '\n';
  }

  // Show same day fee if applicable
  if (order.sameDayFee && order.sameDayFee > 0) {
    r += leftRightAlign('Same Day Fee', `$${order.sameDayFee.toFixed(2)}`) + '\n';
  }

  // Show credit applied if any
  if (order.creditApplied && order.creditApplied > 0) {
    r += leftRightAlign('Credit Applied', `-$${order.creditApplied.toFixed(2)}`) + '\n';
  }

  // === PICKUP INFO ===
  r += ESC.CENTER;
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${isDelivery ? 'Delivery' : 'In-Store'}\n`;
  r += `${isDelivery ? 'Service' : 'Pick Up'}\n`;
  r += ESC.NORMAL_SIZE;

  // Pickup date/time (inverted)
  if (order.estimatedPickupDate) {
    const pickupDate = new Date(order.estimatedPickupDate);
    const pickupDateStr = pickupDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
    const pickupTimeStr = pickupDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    r += ESC.INVERT_ON;
    r += ` ${pickupDateStr} \n`;
    r += ` ${pickupTimeStr} \n`;
    r += ESC.INVERT_OFF;
  }

  // === TOTAL ===
  r += '\n';
  r += ESC.DOUBLE_HEIGHT_ON;
  r += 'TOTAL\n';
  r += ESC.NORMAL_SIZE;
  r += ESC.LEFT;
  r += leftRightAlign(
    order.isPaid ? `Paid (${order.paymentMethod || 'Cash'})` : 'Cash on Pickup',
    `$${(order.totalAmount || 0).toFixed(2)}`
  ) + '\n';

  // === QR CODE (Large for easy scanning) ===
  r += generateQRCode(orderNum, 12);
  r += '\n\n';

  r += cutCommand;

  return r;
}

// Generate store copy
export function generateStoreCopyText(order: Order): string {
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
  const isSameDay = order.isSameDay;

  let r = '';

  r += ESC.INIT;
  r += ESC.CENTER;

  // === STORE COPY HEADER ===
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ' STORE COPY \n';
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;
  r += '\n';

  // === Order Type (inverted) ===
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ` ${isDelivery ? 'Pickup &' : 'In-Store'} \n`;
  r += ` ${isDelivery ? 'Delivery' : 'Pick Up'} \n`;
  if (isSameDay) {
    r += ' SAME DAY \n';
  }
  r += ESC.INVERT_OFF;

  // Order number (inverted)
  r += ESC.INVERT_ON;
  r += ` ${orderNum} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  r += '\n';

  // Date/Time (BIGGER)
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
  r += `${order.customerName || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  if (order.customer?.address) {
    r += `${order.customer.address}\n`;
  }
  r += `${order.customerPhone || ''}\n`;

  // Notes (inverted if present)
  if (order.specialInstructions) {
    r += ESC.INVERT_ON;
    r += ` Notes : \n`;
    r += ` ${order.specialInstructions.substring(0, 20)} \n`;
    r += ESC.INVERT_OFF;
  }

  r += '------------------------------------------------\n';

  // === LAUNDRY ORDER SECTION ===
  r += ESC.CENTER;
  r += ESC.BOLD_ON;
  r += 'Laundry Order\n';
  r += ESC.BOLD_OFF;
  r += ESC.LEFT;

  // Items with weight
  if (order.bags && order.bags.length > 0) {
    order.bags.forEach((bag, index) => {
      const bagName = bag.identifier || `Bag ${index + 1}`;
      const bagWeight = bag.weight || 0;
      r += leftRightAlign(`Item`, 'WEIGHT') + '\n';
      r += leftRightAlign(`${bagName}`, `${bagWeight} LBS`) + '\n';
      if (bag.color) {
        r += `  Color: ${bag.color}\n`;
      }
    });
  } else {
    r += leftRightAlign('Item', 'WEIGHT') + '\n';
    r += leftRightAlign('Laundry', `${order.weight || 0} LBS`) + '\n';
  }

  // Extra items (if any)
  if (order.extraItems && order.extraItems.length > 0) {
    r += '\n';
    r += ESC.CENTER;
    r += 'Extra Items\n';
    r += ESC.LEFT;
    order.extraItems.forEach(item => {
      r += leftRightAlign(`${item.name} x${item.quantity}`, `$${(item.price * item.quantity).toFixed(2)}`) + '\n';
    });
  }

  r += '------------------------------------------------\n';

  // === TOTALS SECTION ===
  r += ESC.LEFT;
  const totalWeight = order.weight || 0;

  // Show subtotal breakdown
  r += leftRightAlign('Weight', `${totalWeight} LBS`) + '\n';
  r += leftRightAlign('Subtotal', `$${(order.subtotal || 0).toFixed(2)}`) + '\n';

  // Show delivery fee if applicable
  if (order.deliveryFee && order.deliveryFee > 0) {
    r += leftRightAlign('Delivery Fee', `$${order.deliveryFee.toFixed(2)}`) + '\n';
  }

  // Show same day fee if applicable
  if (order.sameDayFee && order.sameDayFee > 0) {
    r += leftRightAlign('Same Day Fee', `$${order.sameDayFee.toFixed(2)}`) + '\n';
  }

  // Show credit applied if any
  if (order.creditApplied && order.creditApplied > 0) {
    r += leftRightAlign('Credit Applied', `-$${order.creditApplied.toFixed(2)}`) + '\n';
  }

  // === PICKUP INFO ===
  r += ESC.CENTER;
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${isDelivery ? 'Delivery' : 'In-Store'}\n`;
  r += `${isDelivery ? 'Service' : 'Pick Up'}\n`;
  r += ESC.NORMAL_SIZE;

  // Pickup date/time (inverted)
  if (order.estimatedPickupDate) {
    const pickupDate = new Date(order.estimatedPickupDate);
    const pickupDateStr = pickupDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
    const pickupTimeStr = pickupDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    r += ESC.INVERT_ON;
    r += ` ${pickupDateStr} \n`;
    r += ` ${pickupTimeStr} \n`;
    r += ESC.INVERT_OFF;
  }

  // === TOTAL ===
  r += '\n';
  r += ESC.DOUBLE_HEIGHT_ON;
  r += 'TOTAL\n';
  r += ESC.NORMAL_SIZE;
  r += ESC.LEFT;
  r += leftRightAlign(
    order.isPaid ? `Paid (${order.paymentMethod || 'Cash'})` : 'Cash on Pickup',
    `$${(order.totalAmount || 0).toFixed(2)}`
  ) + '\n';

  // === QR CODE (Large for easy scanning) ===
  r += generateQRCode(orderNum, 12);
  r += '\n';

  // Footer
  r += ESC.CENTER;
  r += ESC.INVERT_ON;
  r += ' STORE COPY - KEEP FOR RECORDS \n';
  r += ESC.INVERT_OFF;
  r += '\n';

  r += cutCommand;

  return r;
}

// Generate bag label
export function generateBagLabelText(order: Order, bag: Bag, bagNumber: number, totalBags: number): string {
  const orderNum = order.orderId?.toString() || order._id?.slice(-6) || '000';
  const isDelivery = order.orderType === 'delivery';

  let r = '';

  r += ESC.INIT;
  r += ESC.CENTER;

  // === BAG HEADER (inverted) ===
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

  // === CUSTOMER NAME (large) ===
  r += ESC.DOUBLE_SIZE_ON;
  r += `${order.customerName || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  r += `${order.customerPhone || ''}\n`;

  r += '------------------------------------------------\n';

  // === ORDER TYPE ===
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

  // === BAG DETAILS ===
  r += ESC.LEFT;
  r += leftRightAlign('Bag ID:', bag.identifier || `Bag ${bagNumber}`) + '\n';
  r += leftRightAlign('Weight:', `${bag.weight || 'TBD'} LBS`) + '\n';
  if (bag.color) {
    r += leftRightAlign('Color:', bag.color) + '\n';
  }

  // Notes
  if (order.specialInstructions) {
    r += '\n';
    r += ESC.INVERT_ON;
    r += ` Notes: ${order.specialInstructions.substring(0, 25)} \n`;
    r += ESC.INVERT_OFF;
  }

  // === QR CODE (Large for easy scanning) ===
  r += generateQRCode(orderNum, 10);
  r += '\n';

  r += ESC.CENTER;
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ` ATTACH TO BAG \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  r += '\n';
  r += cutCommand;

  return r;
}
