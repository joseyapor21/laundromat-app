import type { Order, Bag, Location } from '../types';
import { formatPhoneNumber } from '../utils/phoneFormat';

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

// Word wrap helper - wraps text by words without cutting
function wordWrap(text: string, maxLen: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxLen) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Default store configuration (fallback if no location provided)
const DEFAULT_STORE_CONFIG = {
  name: 'E&F Laundromat',
  address: '215-23 73rd Ave',
  city: 'Oakland Gardens, NY 11364',
  phone: '(347) 204-1333',
};

// Get store config from location or use default
function getStoreConfig(location?: Location | null) {
  if (location) {
    return {
      name: location.name || DEFAULT_STORE_CONFIG.name,
      address: location.address || DEFAULT_STORE_CONFIG.address,
      city: '', // Address should include city
      phone: location.phone ? formatPhoneNumber(location.phone) : DEFAULT_STORE_CONFIG.phone,
    };
  }
  return DEFAULT_STORE_CONFIG;
}

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

// Format time to ASCII-safe string (avoid Unicode AM/PM)
function formatTimeASCII(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
  return `${hours}:${minutesStr} ${ampm}`;
}

// Format time as a window or exact time
// Time windows (minute=0 for 1-hour windows, minute=1 for 2-hour windows):
// 10:00 -> "10:00 AM - 11:00 AM"
// 10:01 -> "10:00 AM - 12:00 PM" (full morning)
// 11:00 -> "11:00 AM - 12:00 PM"
// 16:00 -> "4:00 PM - 5:00 PM"
// 16:01 -> "4:00 PM - 6:00 PM" (full afternoon)
// 17:00 -> "5:00 PM - 6:00 PM"
// Otherwise -> exact time
function formatTimeWindow(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();

  // 1-hour windows (minute=0)
  if (minutes === 0) {
    if (hours === 10) return '10:00 AM - 11:00 AM';
    if (hours === 11) return '11:00 AM - 12:00 PM';
    if (hours === 16) return '4:00 PM - 5:00 PM';
    if (hours === 17) return '5:00 PM - 6:00 PM';
  }
  // 2-hour windows (minute=1 as marker)
  if (minutes === 1) {
    if (hours === 10) return '10:00 AM - 12:00 PM';
    if (hours === 16) return '4:00 PM - 6:00 PM';
  }
  // Any other time: show exact time
  return formatTimeASCII(date);
}

// Format date to ASCII-safe string
function formatDateASCII(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

// Format date with weekday (ASCII-safe)
function formatDateWithWeekday(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekday = days[date.getDay()];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
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
export function generateCustomerReceiptText(order: Order, location?: Location | null): string {
  // Use order drop-off date (creation date), not current time
  const createdDate = order.dropOffDate ? new Date(order.dropOffDate) : new Date();
  const dateStr = formatDateASCII(createdDate);
  const timeStr = formatTimeASCII(createdDate);

  const orderNum = order.orderId?.toString() || order._id?.slice(-6) || '000';
  const isDelivery = order.orderType === 'delivery';
  const isSameDay = order.isSameDay;
  const storeConfig = getStoreConfig(location);

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
  r += `${storeConfig.name}\n`;
  r += ESC.NORMAL_SIZE;
  r += ESC.BOLD_OFF;
  r += `${storeConfig.address}\n`;
  if (storeConfig.city) {
    r += `${storeConfig.city}\n`;
  }
  r += `TEL ${storeConfig.phone}\n`;
  r += '------------------------------------------------\n';

  // === CUSTOMER INFO ===
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${order.customerName || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  if (order.customer?.address) {
    r += `${order.customer.address}\n`;
  }
  if (order.orderType !== 'delivery' && order.customerPhone) {
    r += `${formatPhoneNumber(order.customerPhone)}\n`;
  }

  // Notes (inverted, double size, ASCII-safe)
  if (order.specialInstructions) {
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` Instructions: \n`;
    // Convert to ASCII-safe (replace smart quotes, etc)
    const notes = order.specialInstructions
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x00-\x7F]/g, '');
    // Split by newlines or commas to create bullet points
    const items = notes.split(/[\n,]+/).filter(item => item.trim());
    for (const item of items) {
      const wrappedLines = wordWrap(item.trim(), 18);
      for (let i = 0; i < wrappedLines.length; i++) {
        r += i === 0 ? ` * ${wrappedLines[i]} \n` : `   ${wrappedLines[i]} \n`;
      }
    }
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
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
      // Add bag notes/description if present
      if (bag.description) {
        r += `  -> ${bag.description}\n`;
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
    order.extraItems.forEach((item: any) => {
      const itemName = item.name || item.item?.name || 'Extra Item';
      // Use overrideTotal if set, otherwise calculate from price * quantity
      const itemTotal = (item.overrideTotal !== undefined && item.overrideTotal !== null)
        ? item.overrideTotal
        : Number((item.price * item.quantity).toFixed(2));
      r += leftRightAlign(itemName, `$${itemTotal.toFixed(2)}`) + '\n';
    });
  }

  r += '------------------------------------------------\n';

  // === TOTALS SECTION ===
  r += ESC.LEFT;
  const totalWeight = order.weight || 0;

  // Show weight
  r += ESC.DOUBLE_HEIGHT_ON;
  r += leftRightAlign('Total Weight', `${totalWeight} LBS`) + '\n';
  r += ESC.NORMAL_SIZE;

  // Show laundry subtotal
  // For same-day orders, use the totalAmount minus extras/delivery for accurate same-day pricing
  let laundryTotal = (order.subtotal || 0) + (order.sameDayFee || 0);

  // If same-day and we have the total, recalculate laundry portion for accurate display
  if (isSameDay && order.totalAmount) {
    const extraItemsTotal = order.extraItems?.reduce((sum: number, item: any) => {
      const itemTotal = item.overrideTotal ?? (item.price * item.quantity);
      return sum + itemTotal;
    }, 0) || 0;
    const deliveryFeeForCalc = order.deliveryFee || 0;
    laundryTotal = order.totalAmount - extraItemsTotal - deliveryFeeForCalc + (order.creditApplied || 0);
  }

  if (laundryTotal > 0) {
    const laundryLabel = isSameDay ? 'Laundry (Same Day)' : 'Laundry';
    r += leftRightAlign(laundryLabel, `$${laundryTotal.toFixed(2)}`) + '\n';
  }

  // Show delivery fee (from order or customer record)
  let deliveryFee = order.deliveryFee || 0;
  if (!deliveryFee && isDelivery && order.customer?.deliveryFee) {
    // Parse customer delivery fee (stored as "$3.00" string)
    const feeStr = order.customer.deliveryFee.toString().replace('$', '');
    deliveryFee = parseFloat(feeStr) || 0;
  }
  if (deliveryFee > 0) {
    r += leftRightAlign('Delivery Fee', `$${deliveryFee.toFixed(2)}`) + '\n';
  }

  // Same day fee is included in total but not shown separately on receipt

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

  // Show delivery date for delivery orders, pickup date for store pickups
  const receiptDate = isDelivery ? order.deliverySchedule : order.estimatedPickupDate;
  if (receiptDate) {
    const scheduleDate = new Date(receiptDate);
    const scheduleDateStr = formatDateWithWeekday(scheduleDate);
    const scheduleTimeWindow = formatTimeWindow(scheduleDate);
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` ${scheduleDateStr} \n`;
    r += ` ${scheduleTimeWindow} \n`;
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
  }

  // === TOTAL ===
  r += '\n';
  r += ESC.LEFT;

  // Show order total
  r += leftRightAlign('Order Total:', `$${(order.totalAmount || 0).toFixed(2)}`) + '\n';

  // Calculate balance due after credit
  const balanceDueCustomer = Math.max(0, (order.totalAmount || 0) - (order.creditApplied || 0));

  // Show payment status and balance due
  r += ESC.DOUBLE_HEIGHT_ON;
  if (order.isPaid) {
    r += ESC.INVERT_ON;
    r += ESC.CENTER;
    r += ` PAID - ${(order.paymentMethod || 'Cash').toUpperCase()} \n`;
    r += ESC.INVERT_OFF;
    r += ESC.LEFT;
    r += ESC.NORMAL_SIZE;
    r += leftRightAlign('Balance Due:', '$0.00') + '\n';
  } else {
    r += ESC.NORMAL_SIZE;
    r += leftRightAlign(isDelivery ? 'Pay on Delivery:' : 'Pay on Pickup:', `$${balanceDueCustomer.toFixed(2)}`) + '\n';
  }

  // Show remaining credit if paid and customer has credit
  if (order.isPaid && order.customer?.credit && order.customer.credit > 0) {
    r += ESC.CENTER;
    r += ESC.BOLD_ON;
    r += `Remaining Credit: $${order.customer.credit.toFixed(2)}\n`;
    r += ESC.BOLD_OFF;
  }

  // === QR CODE (Large for easy scanning) ===
  r += generateQRCode(orderNum, 12);
  r += '\n\n';

  r += cutCommand;

  return r;
}

// Generate store copy
export function generateStoreCopyText(order: Order, location?: Location | null): string {
  // Use order drop-off date (creation date), not current time
  const createdDate = order.dropOffDate ? new Date(order.dropOffDate) : new Date();
  const dateStr = formatDateASCII(createdDate);
  const timeStr = formatTimeASCII(createdDate);

  const orderNum = order.orderId?.toString() || order._id?.slice(-6) || '000';
  const isDelivery = order.orderType === 'delivery';
  const isSameDay = order.isSameDay;
  const storeConfig = getStoreConfig(location);

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
  r += `${storeConfig.name}\n`;
  r += ESC.NORMAL_SIZE;
  r += ESC.BOLD_OFF;
  r += `${storeConfig.address}\n`;
  if (storeConfig.city) {
    r += `${storeConfig.city}\n`;
  }
  r += `TEL ${storeConfig.phone}\n`;
  r += '------------------------------------------------\n';

  // === CUSTOMER INFO ===
  r += ESC.DOUBLE_HEIGHT_ON;
  r += `${order.customerName || 'Customer'}\n`;
  r += ESC.NORMAL_SIZE;
  if (order.customer?.address) {
    r += `${order.customer.address}\n`;
  }
  if (order.orderType !== 'delivery' && order.customerPhone) {
    r += `${formatPhoneNumber(order.customerPhone)}\n`;
  }

  // Notes (inverted, double size, ASCII-safe)
  if (order.specialInstructions) {
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` Instructions: \n`;
    // Convert to ASCII-safe (replace smart quotes, etc)
    const notes = order.specialInstructions
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x00-\x7F]/g, '');
    // Split by newlines or commas to create bullet points
    const items = notes.split(/[\n,]+/).filter(item => item.trim());
    for (const item of items) {
      const wrappedLines = wordWrap(item.trim(), 18);
      for (let i = 0; i < wrappedLines.length; i++) {
        r += i === 0 ? ` * ${wrappedLines[i]} \n` : `   ${wrappedLines[i]} \n`;
      }
    }
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
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
      // Add bag notes/description if present
      if (bag.description) {
        r += `  -> ${bag.description}\n`;
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
    order.extraItems.forEach((item: any) => {
      const itemName = item.name || item.item?.name || 'Extra Item';
      // Use overrideTotal if set, otherwise calculate from price * quantity
      const itemTotal = (item.overrideTotal !== undefined && item.overrideTotal !== null)
        ? item.overrideTotal
        : Number((item.price * item.quantity).toFixed(2));
      r += leftRightAlign(itemName, `$${itemTotal.toFixed(2)}`) + '\n';
    });
  }

  r += '------------------------------------------------\n';

  // === TOTALS SECTION ===
  r += ESC.LEFT;
  const totalWeight = order.weight || 0;

  // Show weight
  r += ESC.DOUBLE_HEIGHT_ON;
  r += leftRightAlign('Total Weight', `${totalWeight} LBS`) + '\n';
  r += ESC.NORMAL_SIZE;

  // Show laundry subtotal
  // For same-day orders, use the totalAmount minus extras/delivery for accurate same-day pricing
  let laundryTotal = (order.subtotal || 0) + (order.sameDayFee || 0);

  // If same-day and we have the total, recalculate laundry portion for accurate display
  if (isSameDay && order.totalAmount) {
    const extraItemsTotal = order.extraItems?.reduce((sum: number, item: any) => {
      const itemTotal = item.overrideTotal ?? (item.price * item.quantity);
      return sum + itemTotal;
    }, 0) || 0;
    const deliveryFeeForCalc = order.deliveryFee || 0;
    laundryTotal = order.totalAmount - extraItemsTotal - deliveryFeeForCalc + (order.creditApplied || 0);
  }

  if (laundryTotal > 0) {
    const laundryLabel = isSameDay ? 'Laundry (Same Day)' : 'Laundry';
    r += leftRightAlign(laundryLabel, `$${laundryTotal.toFixed(2)}`) + '\n';
  }

  // Show delivery fee (from order or customer record)
  let deliveryFee = order.deliveryFee || 0;
  if (!deliveryFee && isDelivery && order.customer?.deliveryFee) {
    // Parse customer delivery fee (stored as "$3.00" string)
    const feeStr = order.customer.deliveryFee.toString().replace('$', '');
    deliveryFee = parseFloat(feeStr) || 0;
  }
  if (deliveryFee > 0) {
    r += leftRightAlign('Delivery Fee', `$${deliveryFee.toFixed(2)}`) + '\n';
  }

  // Same day fee is included in total but not shown separately on receipt

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

  // Show delivery date for delivery orders, pickup date for store pickups
  const receiptDate = isDelivery ? order.deliverySchedule : order.estimatedPickupDate;
  if (receiptDate) {
    const scheduleDate = new Date(receiptDate);
    const scheduleDateStr = formatDateWithWeekday(scheduleDate);
    const scheduleTimeWindow = formatTimeWindow(scheduleDate);
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` ${scheduleDateStr} \n`;
    r += ` ${scheduleTimeWindow} \n`;
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
  }

  // === TOTAL ===
  r += '\n';
  r += ESC.LEFT;

  // Show order total
  r += leftRightAlign('Order Total:', `$${(order.totalAmount || 0).toFixed(2)}`) + '\n';

  // Calculate balance due after credit
  const balanceDueStore = Math.max(0, (order.totalAmount || 0) - (order.creditApplied || 0));

  // Show payment status and balance due
  r += ESC.DOUBLE_HEIGHT_ON;
  if (order.isPaid) {
    r += ESC.INVERT_ON;
    r += ESC.CENTER;
    r += ` PAID - ${(order.paymentMethod || 'Cash').toUpperCase()} \n`;
    r += ESC.INVERT_OFF;
    r += ESC.LEFT;
    r += ESC.NORMAL_SIZE;
    r += leftRightAlign('Balance Due:', '$0.00') + '\n';
  } else {
    r += ESC.NORMAL_SIZE;
    r += leftRightAlign(isDelivery ? 'Pay on Delivery:' : 'Pay on Pickup:', `$${balanceDueStore.toFixed(2)}`) + '\n';
  }

  // Show remaining credit if paid and customer has credit
  if (order.isPaid && order.customer?.credit && order.customer.credit > 0) {
    r += ESC.CENTER;
    r += ESC.BOLD_ON;
    r += `Remaining Credit: $${order.customer.credit.toFixed(2)}\n`;
    r += ESC.BOLD_OFF;
  }

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
  if (order.customerPhone) {
    r += `${formatPhoneNumber(order.customerPhone)}\n`;
  }

  r += '------------------------------------------------\n';

  // === ORDER TYPE ===
  r += ESC.DOUBLE_HEIGHT_ON;
  r += ESC.INVERT_ON;
  r += ` ${isDelivery ? 'DELIVERY' : 'IN-STORE PICKUP'} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  // Show delivery date for delivery orders, pickup date for store pickups
  const bagLabelDate = isDelivery ? order.deliverySchedule : order.estimatedPickupDate;
  if (bagLabelDate) {
    const scheduleDate = new Date(bagLabelDate);
    const scheduleDateStr = formatDateWithWeekday(scheduleDate);
    const scheduleTimeWindow = formatTimeWindow(scheduleDate);
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` ${scheduleDateStr} \n`;
    r += ` ${scheduleTimeWindow} \n`;
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

  // Bag-specific notes
  if (bag.description) {
    r += '\n';
    r += ESC.BOLD_ON;
    r += `Bag Notes: ${bag.description}\n`;
    r += ESC.BOLD_OFF;
  }

  // Order instructions (inverted, double size, ASCII-safe)
  if (order.specialInstructions) {
    r += '\n';
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` Instructions: \n`;
    const orderNotes = order.specialInstructions
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x00-\x7F]/g, '');
    // Split by newlines or commas to create bullet points
    const items = orderNotes.split(/[\n,]+/).filter(item => item.trim());
    for (const item of items) {
      const wrappedLines = wordWrap(item.trim(), 18);
      for (let i = 0; i < wrappedLines.length; i++) {
        r += i === 0 ? ` * ${wrappedLines[i]} \n` : `   ${wrappedLines[i]} \n`;
      }
    }
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
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

// Generate simple customer tag (no bag details)
export function generateCustomerTagText(order: Order): string {
  const orderNum = order.orderId?.toString() || order._id?.slice(-6) || '000';
  const isDelivery = order.orderType === 'delivery';

  let r = '';

  r += ESC.INIT;
  r += ESC.CENTER;

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
  if (order.customerPhone) {
    r += `${formatPhoneNumber(order.customerPhone)}\n`;
  }

  r += '------------------------------------------------\n';

  // === ORDER TYPE ===
  r += ESC.DOUBLE_HEIGHT_ON;
  r += ESC.INVERT_ON;
  r += ` ${isDelivery ? 'DELIVERY' : 'IN-STORE PICKUP'} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  // Show delivery date for delivery orders, pickup date for store pickups
  const dateToShow = isDelivery ? order.deliverySchedule : order.estimatedPickupDate;
  if (dateToShow) {
    const scheduleDate = new Date(dateToShow);
    const scheduleDateStr = formatDateWithWeekday(scheduleDate);
    const scheduleTimeWindow = formatTimeWindow(scheduleDate);
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` ${scheduleDateStr} \n`;
    r += ` ${scheduleTimeWindow} \n`;
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
  }

  r += '------------------------------------------------\n';

  // Order instructions (inverted, double size, ASCII-safe)
  if (order.specialInstructions) {
    r += '\n';
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` Instructions: \n`;
    const orderNotes = order.specialInstructions
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x00-\x7F]/g, '');
    // Split by newlines or commas to create bullet points
    const items = orderNotes.split(/[\n,]+/).filter(item => item.trim());
    for (const item of items) {
      const wrappedLines = wordWrap(item.trim(), 18);
      for (let i = 0; i < wrappedLines.length; i++) {
        r += i === 0 ? ` * ${wrappedLines[i]} \n` : `   ${wrappedLines[i]} \n`;
      }
    }
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;
  }

  // === QR CODE (Large for easy scanning) ===
  r += generateQRCode(orderNum, 10);
  r += '\n';

  r += '\n';
  r += cutCommand;

  return r;
}

// Generate credit balance receipt for customer
export function generateCreditBalanceReceipt(customer: { name: string; phoneNumber?: string; credit?: number; creditHistory?: Array<{ amount: number; type: 'add' | 'use'; description: string; createdAt: Date }> }, location?: Location | null): string {
  const storeConfig = getStoreConfig(location);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).replace(/\//g, '-');

  // ASCII-safe time formatting
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  const timeStr = `${hours}:${minutesStr} ${ampm}`;

  let r = '';

  // Initialize printer
  r += ESC.INIT;
  r += ESC.CENTER;

  // === HEADER ===
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.INVERT_ON;
  r += ' CREDIT BALANCE \n';
  r += ESC.INVERT_OFF;
  r += ESC.NORMAL_SIZE;

  // === STORE INFO ===
  r += '\n';
  r += ESC.BOLD_ON;
  r += `${storeConfig.name}\n`;
  r += ESC.BOLD_OFF;
  r += `${storeConfig.address}\n`;
  if (storeConfig.city) {
    r += `${storeConfig.city}\n`;
  }
  r += `${storeConfig.phone}\n`;
  r += '--------------------------------\n';

  // === CUSTOMER INFO ===
  r += ESC.DOUBLE_HEIGHT_ON;
  r += ESC.BOLD_ON;
  r += `${customer.name || 'Customer'}\n`;
  r += ESC.BOLD_OFF;
  r += ESC.NORMAL_SIZE;
  if (customer.phoneNumber) {
    r += `${formatPhoneNumber(customer.phoneNumber)}\n`;
  }
  r += `${dateStr} ${timeStr}\n`;
  r += '--------------------------------\n';

  // === CREDIT BALANCE ===
  r += ESC.CENTER;
  r += ESC.DOUBLE_SIZE_ON;
  r += ESC.BOLD_ON;
  r += ESC.INVERT_ON;
  r += ` $${(customer.credit || 0).toFixed(2)} \n`;
  r += ESC.INVERT_OFF;
  r += ESC.BOLD_OFF;
  r += ESC.NORMAL_SIZE;
  r += '--------------------------------\n';

  // === RECENT CREDIT HISTORY (last 5 transactions) ===
  if (customer.creditHistory && customer.creditHistory.length > 0) {
    r += ESC.LEFT;
    r += ESC.BOLD_ON;
    r += 'Recent Transactions:\n';
    r += ESC.BOLD_OFF;
    r += '--------------------------------\n';
    const recentTransactions = customer.creditHistory.slice(-5).reverse();
    recentTransactions.forEach(tx => {
      const txDateObj = new Date(tx.createdAt);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const txDate = `${months[txDateObj.getMonth()]} ${txDateObj.getDate()}`;

      // ASCII-safe time formatting
      let hours = txDateObj.getHours();
      const minutes = txDateObj.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
      const txTime = `${hours}:${minutesStr} ${ampm}`;

      const amount = tx.type === 'add' ? `+$${tx.amount.toFixed(2)}` : `-$${tx.amount.toFixed(2)}`;
      const typeLabel = tx.type === 'add' ? 'ADDED' : 'USED';

      // Date, time and amount line
      r += ESC.BOLD_ON;
      r += leftRightAlign(`${txDate} ${txTime}`, amount) + '\n';
      r += ESC.BOLD_OFF;

      // Type and description on separate line
      r += `  ${typeLabel}`;
      if (tx.description) {
        r += `\n  ${tx.description}`;
      }
      r += '\n';
    });
    r += '--------------------------------\n';
  }

  // === FOOTER ===
  r += ESC.CENTER;
  r += 'Thank you for your business!\n';
  r += '\n';
  r += cutCommand;

  return r;
}
