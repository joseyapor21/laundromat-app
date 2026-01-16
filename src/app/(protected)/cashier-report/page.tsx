'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Order, PaymentMethod } from '@/types';

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
  FEED_AND_CUT: '\n\n\n\n\n\x1D\x56\x41\x03',
};

const STORE_CONFIG = {
  name: 'E&F Laundromat',
  address: '215-23 73rd Ave',
  city: 'Oakland Gardens, NY 11364',
  phone: '(347) 204-1333',
};

export default function CashierReportPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  useEffect(() => {
    loadOrders();
  }, [selectedDate]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      // Use paidDate to get orders paid on the selected date (not by pickup/delivery date)
      const response = await fetch(`/api/orders?paidDate=${selectedDate}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals and counts by payment method
  // Credit payments are counted under cash
  type DisplayPaymentMethod = 'cash' | 'check' | 'venmo' | 'zelle';
  const getPaymentSummary = () => {
    const summary: Record<DisplayPaymentMethod, { total: number; count: number }> = {
      cash: { total: 0, count: 0 },
      check: { total: 0, count: 0 },
      venmo: { total: 0, count: 0 },
      zelle: { total: 0, count: 0 },
    };

    let grandTotal = 0;
    let creditCount = 0;
    let creditTotal = 0;

    orders.forEach(order => {
      // Default to 'cash' if no payment method is set
      // Count 'credit' payments as cash
      let method: DisplayPaymentMethod = (order.paymentMethod || 'cash') as DisplayPaymentMethod;
      if (order.paymentMethod === 'credit') {
        method = 'cash';
        creditCount += 1;
        creditTotal += order.totalAmount;
      }
      summary[method].total += order.totalAmount;
      summary[method].count += 1;
      grandTotal += order.totalAmount;
    });

    return { summary, grandTotal, creditCount, creditTotal };
  };

  const { summary, grandTotal, creditCount, creditTotal } = getPaymentSummary();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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

  const handleShare = async () => {
    // Format date for display
    const reportDate = new Date(selectedDate + 'T00:00:00');
    const dateStr = reportDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    let text = '📊 CASHIER REPORT\n';
    text += `📅 ${dateStr}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

    text += '💰 PAYMENT SUMMARY\n';
    text += `Cash: ${formatCurrency(summary.cash.total)} (${summary.cash.count} orders)\n`;
    if (creditCount > 0) {
      text += `  └ ${creditCount} from credit: ${formatCurrency(creditTotal)}\n`;
    }
    text += `Check: ${formatCurrency(summary.check.total)} (${summary.check.count} orders)\n`;
    text += `Venmo: ${formatCurrency(summary.venmo.total)} (${summary.venmo.count} orders)\n`;
    text += `Zelle: ${formatCurrency(summary.zelle.total)} (${summary.zelle.count} orders)\n\n`;

    text += '━━━━━━━━━━━━━━━━━━━━━━\n';
    text += `💵 TOTAL: ${formatCurrency(grandTotal)}\n`;
    text += `📦 Orders: ${orders.length}\n`;
    text += '━━━━━━━━━━━━━━━━━━━━━━\n\n';

    text += '📋 ORDER DETAILS\n';
    orders.forEach(order => {
      const method = order.paymentMethod === 'credit'
        ? 'Credit'
        : (order.paymentMethod?.toUpperCase() || 'CASH');
      text += `#${order.orderId} ${order.customerName || ''} - ${formatCurrency(order.totalAmount)} (${method})\n`;
    });

    text += '\n━━━━━━━━━━━━━━━━━━━━━━\n';
    text += `Generated: ${new Date().toLocaleString()}\n`;

    // Try Web Share API first, fallback to clipboard
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Cashier Report - ${dateStr}`,
          text: text,
        });
        toast.success('Report shared successfully');
      } catch (error) {
        // User cancelled or share failed - try clipboard
        if ((error as Error).name !== 'AbortError') {
          await navigator.clipboard.writeText(text);
          toast.success('Report copied to clipboard');
        }
      }
    } else {
      // Fallback to clipboard
      await navigator.clipboard.writeText(text);
      toast.success('Report copied to clipboard');
    }
  };

  const handlePrintThermal = async () => {
    setPrinting(true);
    try {
      // Format date for display
      const reportDate = new Date(selectedDate + 'T00:00:00');
      const dateStr = reportDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      let r = '';
      r += ESC.INIT;
      r += ESC.CENTER;

      // Store Info
      r += ESC.BOLD_ON;
      r += `${STORE_CONFIG.name}\n`;
      r += ESC.BOLD_OFF;
      r += `${STORE_CONFIG.address}\n`;
      r += `${STORE_CONFIG.city}\n`;
      r += `${STORE_CONFIG.phone}\n`;
      r += '\n';

      // Header
      r += ESC.DOUBLE_SIZE_ON;
      r += ESC.INVERT_ON;
      r += ' CASHIER REPORT \n';
      r += ESC.INVERT_OFF;
      r += ESC.NORMAL_SIZE;
      r += '\n';

      r += ESC.DOUBLE_HEIGHT_ON;
      r += `${dateStr}\n`;
      r += ESC.NORMAL_SIZE;
      r += '================================================\n';

      // Summary by payment method
      r += ESC.LEFT;
      r += ESC.BOLD_ON;
      r += 'PAYMENT SUMMARY\n';
      r += ESC.BOLD_OFF;
      r += '------------------------------------------------\n';

      r += leftRightAlign(`Cash (${summary.cash.count} orders)`, `$${summary.cash.total.toFixed(2)}`) + '\n';
      if (creditCount > 0) {
        r += `  (${creditCount} from credit)\n`;
      }
      r += leftRightAlign(`Check (${summary.check.count} orders)`, `$${summary.check.total.toFixed(2)}`) + '\n';
      r += leftRightAlign(`Venmo (${summary.venmo.count} orders)`, `$${summary.venmo.total.toFixed(2)}`) + '\n';
      r += leftRightAlign(`Zelle (${summary.zelle.count} orders)`, `$${summary.zelle.total.toFixed(2)}`) + '\n';

      r += '================================================\n';
      r += ESC.DOUBLE_HEIGHT_ON;
      r += ESC.BOLD_ON;
      r += leftRightAlign('TOTAL', `$${grandTotal.toFixed(2)}`) + '\n';
      r += leftRightAlign('Orders', orders.length.toString()) + '\n';
      r += ESC.BOLD_OFF;
      r += ESC.NORMAL_SIZE;
      r += '================================================\n';

      // Individual orders
      r += '\n';
      r += ESC.CENTER;
      r += ESC.BOLD_ON;
      r += 'ORDER DETAILS\n';
      r += ESC.BOLD_OFF;
      r += ESC.LEFT;
      r += '------------------------------------------------\n';

      orders.forEach(order => {
        const method = order.paymentMethod === 'credit'
          ? 'CASH (Credit)'
          : (order.paymentMethod?.toUpperCase() || 'CASH');
        const weightStr = order.weight ? `${order.weight} lbs` : '';
        r += leftRightAlign(`#${order.orderId} ${order.customerName?.substring(0, 18) || ''}`, `$${order.totalAmount.toFixed(2)}`) + '\n';
        r += `  ${method}${weightStr ? ` - ${weightStr}` : ''}\n`;
      });

      r += '================================================\n';
      r += ESC.CENTER;
      r += `Printed: ${new Date().toLocaleString()}\n`;
      r += '\n';
      r += ESC.FEED_AND_CUT;

      // Send to printer
      const response = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: r }),
      });

      if (response.ok) {
        toast.success('Report printed successfully');
      } else {
        throw new Error('Print failed');
      }
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print report');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Cashier Report</h1>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Back
          </button>
        </div>

        {/* Date Picker */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Select Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full md:w-auto px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          />
        </div>

        {/* Summary Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-green-600 font-medium">Cash</div>
                  <div className="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded-full">
                    {summary.cash.count} orders
                  </div>
                </div>
                <div className="text-2xl font-bold text-green-800 mt-1">
                  {formatCurrency(summary.cash.total)}
                </div>
                {creditCount > 0 && (
                  <div className="text-xs text-green-600 mt-1">
                    ({creditCount} credit = {formatCurrency(creditTotal)})
                  </div>
                )}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-blue-600 font-medium">Check</div>
                  <div className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                    {summary.check.count} orders
                  </div>
                </div>
                <div className="text-2xl font-bold text-blue-800 mt-1">
                  {formatCurrency(summary.check.total)}
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-purple-600 font-medium">Venmo</div>
                  <div className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                    {summary.venmo.count} orders
                  </div>
                </div>
                <div className="text-2xl font-bold text-purple-800 mt-1">
                  {formatCurrency(summary.venmo.total)}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-amber-600 font-medium">Zelle</div>
                  <div className="text-xs bg-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
                    {summary.zelle.count} orders
                  </div>
                </div>
                <div className="text-2xl font-bold text-amber-800 mt-1">
                  {formatCurrency(summary.zelle.total)}
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="bg-slate-800 text-white rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-slate-300 text-sm">Total Revenue</div>
                  <div className="text-3xl font-bold mt-1">
                    {formatCurrency(grandTotal)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-300 text-sm">Orders</div>
                  <div className="text-2xl font-bold mt-1">{orders.length}</div>
                </div>
              </div>
            </div>

            {/* Orders List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-800">Paid Orders</h2>
              </div>

              {orders.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No paid orders for this date
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {orders.map(order => (
                    <div key={order._id} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-800">
                          #{order.orderId} - {order.customerName}
                        </div>
                        <div className="text-sm text-slate-500">
                          {order.paymentMethod === 'credit' ? (
                            <span>CASH <span className="text-green-600">(Credit)</span></span>
                          ) : (
                            order.paymentMethod?.toUpperCase() || 'CASH'
                          )}
                          {order.paidAt && (
                            <span className="ml-2 text-slate-400">
                              • {new Date(order.paidAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          )}
                          {order.paidBy && (
                            <span className="ml-1 text-slate-400">by {order.paidBy}</span>
                          )}
                        </div>
                      </div>
                      <div className="font-bold text-slate-800">
                        {formatCurrency(order.totalAmount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Print & Share Buttons */}
            <div className="mt-6 flex flex-col md:flex-row gap-3">
              <button
                onClick={handlePrintThermal}
                disabled={printing}
                className="flex-1 md:flex-none px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {printing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Printing...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print to Thermal Printer
                  </>
                )}
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 md:flex-none px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Print to Browser
              </button>
              <button
                onClick={handleShare}
                className="flex-1 md:flex-none px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share Report
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
