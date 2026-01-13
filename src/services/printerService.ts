import { Order } from '@/types';

class PrinterService {
  private apiUrl = '/api/print';

  async printReceipt(order: Order): Promise<boolean> {
    try {
      const receipt = this.generateReceiptText(order);

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ content: receipt }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Print failed');
      }

      return true;
    } catch (error) {
      console.error('Print error:', error);
      throw error;
    }
  }

  async testPrinter(): Promise<boolean> {
    try {
      const testContent = this.generateTestReceipt();

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ content: testContent }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Test print failed');
      }

      return true;
    } catch (error) {
      console.error('Test print error:', error);
      throw error;
    }
  }

  private generateReceiptText(order: Order): string {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const centerText = (text: string): string => {
      const maxWidth = 48;
      if (text.length >= maxWidth) return text;
      const padding = Math.floor((maxWidth - text.length) / 2);
      return ' '.repeat(padding) + text;
    };

    const leftRightAlign = (left: string, right: string): string => {
      const maxWidth = 48;
      const totalContentLength = left.length + right.length;
      if (totalContentLength >= maxWidth) {
        return `${left} ${right}`;
      }
      const padding = maxWidth - totalContentLength;
      return left + ' '.repeat(padding) + right;
    };

    let receipt = '';

    // Header
    receipt += '================================================\n';
    if (order.orderType === 'delivery') {
      receipt += centerText('** DELIVERY SERVICE **') + '\n';
    } else {
      receipt += centerText('** IN-STORE PICKUP **') + '\n';
    }
    receipt += centerText('LAUNDROMAT RECEIPT') + '\n';
    receipt += '================================================\n';
    receipt += leftRightAlign('Order #:', String(order.orderId)) + '\n';
    receipt += leftRightAlign('Date:', date) + '\n';
    receipt += '------------------------------------------------\n';

    // Customer Information
    receipt += centerText('CUSTOMER INFORMATION') + '\n';
    receipt += '------------------------------------------------\n';
    receipt += `Customer: ${order.customerName}\n`;
    receipt += `Phone: ${order.customerPhone}\n`;

    if (order.orderType === 'delivery' && order.customer?.address) {
      receipt += `Address: ${order.customer.address}\n`;
    }

    receipt += '------------------------------------------------\n';

    // Order Details
    if (order.weight) {
      receipt += leftRightAlign('Weight:', `${order.weight} lbs`) + '\n';
    }

    if (order.isSameDay) {
      receipt += centerText('** SAME DAY SERVICE **') + '\n';
    }

    // Payment Summary
    receipt += '================================================\n';
    receipt += leftRightAlign('TOTAL:', `$${(order.totalAmount || 0).toFixed(2)}`) + '\n';
    receipt += '================================================\n';

    if (order.isPaid) {
      const paymentStatus = `PAID: ${order.paymentMethod?.toUpperCase() || 'CASH'}`;
      receipt += centerText(paymentStatus) + '\n';
    } else {
      receipt += centerText('PAYMENT: PENDING') + '\n';
    }

    const status = order.status.replace(/_/g, ' ').toUpperCase();
    receipt += centerText(`Status: ${status}`) + '\n';

    if (order.specialInstructions) {
      receipt += '------------------------------------------------\n';
      receipt += centerText('NOTES') + '\n';
      receipt += '------------------------------------------------\n';
      receipt += `${order.specialInstructions}\n`;
    }

    receipt += '================================================\n';
    receipt += centerText('Thank you for your business!') + '\n';
    receipt += centerText('Please keep this receipt') + '\n';
    receipt += '================================================\n\n\n';

    return receipt;
  }

  private generateTestReceipt(): string {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const centerText = (text: string): string => {
      const maxWidth = 48;
      if (text.length >= maxWidth) return text;
      const padding = Math.floor((maxWidth - text.length) / 2);
      return ' '.repeat(padding) + text;
    };

    const leftRightAlign = (left: string, right: string): string => {
      const maxWidth = 48;
      const totalContentLength = left.length + right.length;
      if (totalContentLength >= maxWidth) {
        return `${left} ${right}`;
      }
      const padding = maxWidth - totalContentLength;
      return left + ' '.repeat(padding) + right;
    };

    let receipt = '';
    receipt += '================================================\n';
    receipt += centerText('PRINTER TEST') + '\n';
    receipt += '================================================\n';
    receipt += leftRightAlign('Date:', date) + '\n';
    receipt += leftRightAlign('Status:', 'Connected') + '\n';
    receipt += leftRightAlign('Type:', 'Thermal Printer 80mm') + '\n';
    receipt += '------------------------------------------------\n';
    receipt += centerText('TEST MESSAGE') + '\n';
    receipt += '------------------------------------------------\n';
    receipt += 'This is a test print. If you can read this,\n';
    receipt += 'your thermal printer is working correctly.\n';
    receipt += '------------------------------------------------\n';
    receipt += centerText('CHARACTER WIDTH TEST') + '\n';
    receipt += '------------------------------------------------\n';
    receipt += '123456789012345678901234567890123456789012345678\n';
    receipt += '================================================\n';
    receipt += centerText('TEST COMPLETED SUCCESSFULLY') + '\n';
    receipt += '================================================\n\n\n';

    return receipt;
  }
}

export const printerService = new PrinterService();
