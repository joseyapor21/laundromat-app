'use client';

import type { Order, Bag, Customer } from '@/types';

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
  QR_ERROR_L: '\x1D\x28\x6B\x03\x00\x31\x45\x30',       // Error correction L (7% - larger modules)
  QR_ERROR_M: '\x1D\x28\x6B\x03\x00\x31\x45\x31',       // Error correction M (15%)
  QR_ERROR_Q: '\x1D\x28\x6B\x03\x00\x31\x45\x32',       // Error correction Q (25%)
  QR_ERROR_H: '\x1D\x28\x6B\x03\x00\x31\x45\x33',       // Error correction H (30% - best for scanning)
  QR_STORE: (data: string) => {
    const len = data.length + 3;
    const pL = len % 256;
    const pH = Math.floor(len / 256);
    return `\x1D\x28\x6B${String.fromCharCode(pL)}${String.fromCharCode(pH)}\x31\x50\x30${data}`;
  },
  QR_PRINT: '\x1D\x28\x6B\x03\x00\x31\x51\x30',         // Print QR code
};

// Store configuration - can be loaded from settings
const STORE_CONFIG = {
  name: 'E&F Laundromat',
  address: '215-23 73rd Ave',
  city: 'Oakland Gardens, NY 11364',
  phone: '(347) 204-1333',
};

class PrinterService {
  private cutCommand = ESC.FEED_AND_CUT;

  // Generate QR code ESC/POS commands
  // Size: 1-16 (bigger = easier to scan), Error: L/M/Q/H (H = most error tolerant)
  private generateQRCode(data: string, size: number = 10): string {
    let qr = '';
    qr += '\n\n';                 // Add space before QR
    qr += ESC.CENTER;
    qr += ESC.QR_MODEL;           // Set model 2
    qr += ESC.QR_SIZE(size);      // Set size (bigger = easier to scan)
    qr += ESC.QR_ERROR_L;         // Use L for larger modules (easier scanning with simple data)
    qr += ESC.QR_STORE(data);     // Store data
    qr += ESC.QR_PRINT;           // Print QR
    qr += '\n\n';                 // Add space after QR
    return qr;
  }
  // Queue print job through the API
  async queuePrintJob(content: string): Promise<boolean> {
    try {
      const response = await fetch('/api/print-jobs/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content, printerId: 'main', priority: 'normal' }),
      });

      if (!response.ok) {
        throw new Error('Failed to queue print job');
      }

      const result = await response.json();
      console.log(`Print job queued with ID: ${result.jobId}`);
      return true;
    } catch (error) {
      console.error('Failed to queue print job:', error);
      throw error;
    }
  }

  // Direct print via thermal printer
  async printDirect(content: string): Promise<boolean> {
    try {
      const response = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        return true;
      } else {
        // Fall back to queue system
        console.log('Direct printing failed, queuing print job...');
        return await this.queuePrintJob(content);
      }
    } catch (error) {
      // Direct printing failed, use queue system
      console.log('Direct printing failed, queuing print job...');
      return await this.queuePrintJob(content);
    }
  }

  // Print document with fallback
  private async printDocument(content: string, description: string): Promise<boolean> {
    try {
      console.log(`Printing ${description}...`);
      return await this.printDirect(content);
    } catch (error) {
      console.error(`Error printing ${description}:`, error);
      return false;
    }
  }

  // Print order receipts only (customer receipt + store copy) - NO bag labels
  async printOrderReceipts(order: Order): Promise<boolean> {
    try {
      // 1. Customer receipt
      const customerReceipt = this.generateCustomerReceiptText(order);
      await this.printDocument(customerReceipt, 'Customer Receipt');

      // 2. Store copy
      const storeCopy = this.generateStoreCopyText(order);
      await this.printDocument(storeCopy, 'Store Copy');

      return true;
    } catch (error) {
      console.error('Order receipt printing error:', error);
      throw new Error(`Failed to print order receipts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Print customer receipt only
  async printCustomerReceipt(order: Order): Promise<boolean> {
    try {
      const customerReceipt = this.generateCustomerReceiptText(order);
      await this.printDocument(customerReceipt, 'Customer Receipt');
      return true;
    } catch (error) {
      console.error('Customer receipt printing error:', error);
      throw new Error(`Failed to print customer receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Print store copy only
  async printStoreCopy(order: Order): Promise<boolean> {
    try {
      const storeCopy = this.generateStoreCopyText(order);
      await this.printDocument(storeCopy, 'Store Copy');
      return true;
    } catch (error) {
      console.error('Store copy printing error:', error);
      throw new Error(`Failed to print store copy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Print all bag labels only
  async printBagLabels(order: Order): Promise<boolean> {
    try {
      if (!order.bags || order.bags.length === 0) {
        throw new Error('No bags to print labels for');
      }

      for (let i = 0; i < order.bags.length; i++) {
        const bagLabel = this.generateBagLabelText(order, order.bags[i], i + 1, order.bags.length);
        await this.printDocument(bagLabel, `Bag ${i + 1} Label`);
      }

      return true;
    } catch (error) {
      console.error('Bag label printing error:', error);
      throw new Error(`Failed to print bag labels: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Print single bag label
  async printSingleBagLabel(order: Order, bagIndex: number): Promise<boolean> {
    try {
      if (!order.bags || !order.bags[bagIndex]) {
        throw new Error('Bag not found');
      }

      const bag = order.bags[bagIndex];
      const bagLabel = this.generateBagLabelText(order, bag, bagIndex + 1, order.bags.length);
      await this.printDocument(bagLabel, `Bag ${bagIndex + 1} Label`);

      return true;
    } catch (error) {
      console.error('Single bag label printing error:', error);
      throw new Error(`Failed to print bag label: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Full order printing - receipts + all bag labels (for new order creation)
  async printOrderLabels(order: Order): Promise<boolean> {
    try {
      // Print receipts first
      await this.printOrderReceipts(order);

      // Then print bag labels if any
      if (order.bags && order.bags.length > 0) {
        await this.printBagLabels(order);
      }

      return true;
    } catch (error) {
      console.error('Full order printing error:', error);
      throw new Error(`Failed to print order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Test print
  async testPrinter(): Promise<boolean> {
    try {
      const testContent = this.generateTestReceipt();
      return await this.printDirect(testContent);
    } catch (error) {
      console.error('Printer test error:', error);
      return false;
    }
  }

  // Utility functions
  private centerText(text: string): string {
    const maxWidth = 48;
    if (text.length >= maxWidth) return text;
    const padding = Math.floor((maxWidth - text.length) / 2);
    return ' '.repeat(padding) + text;
  }

  private leftRightAlign(left: string, right: string): string {
    const maxWidth = 48;
    const totalContentLength = left.length + right.length;
    if (totalContentLength >= maxWidth) {
      return `${left} ${right}`;
    }
    const padding = maxWidth - totalContentLength;
    return left + ' '.repeat(padding) + right;
  }

  private wrapText(text: string, maxWidth: number = 46): string[] {
    if (text.length <= maxWidth) return [text];
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word.substring(0, maxWidth));
          currentLine = word.substring(maxWidth);
        }
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private formatDate(date?: Date | string): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Generate customer receipt - matches the E&F Laundromat format
  private generateCustomerReceiptText(order: Order): string {
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
    const orderTypeLabel = isDelivery ? 'Pickup & Delivery' : 'In-Store\nPick Up';

    // Use the isSameDay flag from the order (only show when explicitly marked as same day)
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

    r += '\n';  // Space after order number

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
    // Customer address (for delivery orders)
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
        r += this.leftRightAlign(`Item`, 'WEIGHT');
        r += '\n';
        r += this.leftRightAlign(`${bagName}`, `${bagWeight} LBS`);
        r += '\n';
        // Add bag notes/description if present
        if (bag.description) {
          r += `  -> ${bag.description}\n`;
        }
      });
    } else {
      r += this.leftRightAlign('Item', 'WEIGHT') + '\n';
      r += this.leftRightAlign('Laundry', `${order.weight || 0} LBS`) + '\n';
    }

    // Extra items (if any)
    if (order.extraItems && order.extraItems.length > 0) {
      r += '\n';
      r += ESC.CENTER;
      r += 'Extra Items\n';
      r += ESC.LEFT;
      order.extraItems.forEach(extraItem => {
        const itemName = extraItem.item?.name || 'Extra Item';
        r += this.leftRightAlign(`${itemName} x${extraItem.quantity}`, `$${(extraItem.price * extraItem.quantity).toFixed(2)}`) + '\n';
      });
    }

    r += '------------------------------------------------\n';

    // === TOTALS SECTION ===
    r += ESC.LEFT;
    const totalWeight = order.weight || 0;

    // Show weight
    r += this.leftRightAlign('Total Weight', `${totalWeight} LBS`) + '\n';

    // Show same day indicator if applicable
    if (order.isSameDay) {
      r += this.leftRightAlign('Same Day Service', 'YES') + '\n';
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
    r += this.leftRightAlign(
      order.isPaid ? `Paid (${order.paymentMethod || 'Cash'})` : 'Cash on Pickup',
      `$${(order.totalAmount || 0).toFixed(2)}`
    ) + '\n';

    // === QR CODE (Large for easy scanning) ===
    r += this.generateQRCode(orderNum, 12);  // Size 12 = very large, easy to scan
    r += '\n\n';

    r += this.cutCommand;

    return r;
  }

  // Generate store copy - same format but marked as STORE COPY
  private generateStoreCopyText(order: Order): string {
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

    // Use the isSameDay flag from the order (only show when explicitly marked as same day)
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

    r += '\n';  // Space after order number

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
    // Customer address (for delivery orders)
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
        r += this.leftRightAlign(`Item`, 'WEIGHT') + '\n';
        r += this.leftRightAlign(`${bagName}`, `${bagWeight} LBS`) + '\n';
        if (bag.color) {
          r += `  Color: ${bag.color}\n`;
        }
        // Add bag notes/description if present
        if (bag.description) {
          r += `  -> ${bag.description}\n`;
        }
      });
    } else {
      r += this.leftRightAlign('Item', 'WEIGHT') + '\n';
      r += this.leftRightAlign('Laundry', `${order.weight || 0} LBS`) + '\n';
    }

    // Extra items (if any)
    if (order.extraItems && order.extraItems.length > 0) {
      r += '\n';
      r += ESC.CENTER;
      r += 'Extra Items\n';
      r += ESC.LEFT;
      order.extraItems.forEach(extraItem => {
        const itemName = extraItem.item?.name || 'Extra Item';
        r += this.leftRightAlign(`${itemName} x${extraItem.quantity}`, `$${(extraItem.price * extraItem.quantity).toFixed(2)}`) + '\n';
      });
    }

    r += '------------------------------------------------\n';

    // === TOTALS SECTION ===
    r += ESC.LEFT;
    const totalWeight = order.weight || 0;

    // Show weight
    r += this.leftRightAlign('Total Weight', `${totalWeight} LBS`) + '\n';

    // Show same day indicator if applicable
    if (order.isSameDay) {
      r += this.leftRightAlign('Same Day Service', 'YES') + '\n';
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
    r += this.leftRightAlign(
      order.isPaid ? `Paid (${order.paymentMethod || 'Cash'})` : 'Cash on Pickup',
      `$${(order.totalAmount || 0).toFixed(2)}`
    ) + '\n';

    // === QR CODE (Large for easy scanning) ===
    r += this.generateQRCode(orderNum, 12);  // Size 12 = very large, easy to scan
    r += '\n';

    // Footer
    r += ESC.CENTER;
    r += ESC.INVERT_ON;
    r += ' STORE COPY - KEEP FOR RECORDS \n';
    r += ESC.INVERT_OFF;
    r += '\n';
    r += this.cutCommand;

    return r;
  }

  // Generate individual bag label - compact format for attaching to bags
  private generateBagLabelText(order: Order, bag: Bag, bagNumber: number, totalBags: number): string {
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

    r += '\n';  // Space after order number

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
    r += this.leftRightAlign('Bag ID:', bag.identifier || `Bag ${bagNumber}`) + '\n';
    r += this.leftRightAlign('Weight:', `${bag.weight || 'TBD'} LBS`) + '\n';
    if (bag.color) {
      r += this.leftRightAlign('Color:', bag.color) + '\n';
    }

    // Bag-specific notes
    if (bag.description) {
      r += '\n';
      r += ESC.BOLD_ON;
      r += `Bag Notes: ${bag.description}\n`;
      r += ESC.BOLD_OFF;
    }

    // Order notes
    if (order.specialInstructions) {
      r += '\n';
      r += ESC.INVERT_ON;
      r += ` Notes: ${order.specialInstructions.substring(0, 25)} \n`;
      r += ESC.INVERT_OFF;
    }

    // === QR CODE (Large for easy scanning) ===
    r += this.generateQRCode(orderNum, 10);  // Size 10 = large, easy to scan
    r += '\n';

    r += ESC.CENTER;
    r += ESC.DOUBLE_SIZE_ON;
    r += ESC.INVERT_ON;
    r += ` ATTACH TO BAG \n`;
    r += ESC.INVERT_OFF;
    r += ESC.NORMAL_SIZE;

    r += '\n';
    r += this.cutCommand;

    return r;
  }

  // Print customer balance/credit statement
  async printCustomerBalance(customer: Customer): Promise<boolean> {
    try {
      const balanceReceipt = this.generateCustomerBalanceText(customer);
      await this.printDocument(balanceReceipt, 'Customer Balance');
      return true;
    } catch (error) {
      console.error('Customer balance printing error:', error);
      throw new Error(`Failed to print customer balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Generate customer balance receipt with QR code
  private generateCustomerBalanceText(customer: Customer): string {
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
        r += this.leftRightAlign(txDate, amount) + '\n';
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
    r += this.generateQRCode(qrData, 12);

    r += ESC.CENTER;
    r += 'Scan QR to view full credit history\n';
    r += '\n';

    r += ESC.DOUBLE_HEIGHT_ON;
    r += 'Thank you for your business!\n';
    r += ESC.NORMAL_SIZE;

    r += '\n';
    r += this.cutCommand;

    return r;
  }

  // Generate test receipt
  private generateTestReceipt(): string {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    let receipt = '';
    receipt += '================================================\n';
    receipt += this.centerText('PRINTER TEST') + '\n';
    receipt += '================================================\n';
    receipt += this.leftRightAlign('Date:', date) + '\n';
    receipt += this.leftRightAlign('Status:', 'Connected') + '\n';
    receipt += this.leftRightAlign('Type:', 'Thermal Printer 80mm') + '\n';
    receipt += this.leftRightAlign('Width:', '48 characters') + '\n';
    receipt += '------------------------------------------------\n';
    receipt += this.centerText('TEST MESSAGE') + '\n';
    receipt += '------------------------------------------------\n';
    receipt += 'This is a test print using the full 80mm width.\n';
    receipt += 'If you can read this clearly and the formatting\n';
    receipt += 'appears correct, your thermal printer is working\n';
    receipt += 'properly and is configured for optimal printing.\n';
    receipt += '------------------------------------------------\n';
    receipt += this.centerText('CHARACTER WIDTH TEST') + '\n';
    receipt += '------------------------------------------------\n';
    receipt += '123456789012345678901234567890123456789012345678\n';
    receipt += 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUV\n';
    receipt += '================================================\n';
    receipt += this.centerText('TEST COMPLETED SUCCESSFULLY') + '\n';
    receipt += '================================================\n';
    receipt += this.cutCommand;

    return receipt;
  }
}

export const printerService = new PrinterService();
