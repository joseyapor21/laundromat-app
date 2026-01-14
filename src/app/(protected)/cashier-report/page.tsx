'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Order, PaymentMethod } from '@/types';

export default function CashierReportPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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
      const response = await fetch(`/api/orders?date=${selectedDate}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data.filter((o: Order) => o.isPaid));
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

    orders.forEach(order => {
      // Default to 'cash' if no payment method is set
      // Count 'credit' payments as cash
      let method: DisplayPaymentMethod = (order.paymentMethod || 'cash') as DisplayPaymentMethod;
      if (order.paymentMethod === 'credit') {
        method = 'cash';
      }
      summary[method].total += order.totalAmount;
      summary[method].count += 1;
      grandTotal += order.totalAmount;
    });

    return { summary, grandTotal };
  };

  const { summary, grandTotal } = getPaymentSummary();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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
                          {order.paymentMethod?.toUpperCase()}
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

            {/* Print Button */}
            <button
              onClick={() => window.print()}
              className="mt-6 w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Print Report
            </button>
          </>
        )}
      </div>
    </div>
  );
}
