'use client';

import React, { useState } from 'react';
import { Order, PaymentMethod, OrderStatus } from '@/types';
import toast from 'react-hot-toast';

interface POSOrdersPanelProps {
  orders: Order[];
  selectedOrder: Order | null;
  onSelectOrder: (order: Order | null) => void;
  onOrderUpdated: () => void;
}

const STATUS_GROUPS = [
  { key: 'new', label: 'New', statuses: ['new_order'] as OrderStatus[], color: 'blue' },
  { key: 'processing', label: 'Processing', statuses: ['received', 'in_washer', 'transferred', 'transfer_checked', 'in_dryer', 'laid_on_cart', 'on_cart', 'folding', 'folded'] as OrderStatus[], color: 'amber' },
  { key: 'ready', label: 'Ready', statuses: ['ready_for_pickup', 'ready_for_delivery'] as OrderStatus[], color: 'green' },
];

const NEXT_STATUS_MAP: Record<string, OrderStatus> = {
  'new_order': 'received',
  'received': 'in_washer',
  'in_washer': 'transferred',
  'transferred': 'in_dryer',
  'in_dryer': 'folding',
  'folding': 'folded',
  'folded': 'ready_for_pickup',
  'ready_for_pickup': 'completed',
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; color: string }[] = [
  { value: 'cash', label: 'Cash', color: 'green' },
  { value: 'venmo', label: 'Venmo', color: 'blue' },
  { value: 'zelle', label: 'Zelle', color: 'purple' },
  { value: 'check', label: 'Check', color: 'gray' },
];

export default function POSOrdersPanel({
  orders,
  selectedOrder,
  onSelectOrder,
  onOrderUpdated,
}: POSOrdersPanelProps) {
  const [loading, setLoading] = useState(false);

  // Filter out completed and archived orders
  const activeOrders = orders.filter(o =>
    !['completed', 'archived'].includes(o.status) && !(o as any).deletedAt
  );

  // Group orders by status
  const groupedOrders = STATUS_GROUPS.map(group => ({
    ...group,
    orders: activeOrders.filter(o => group.statuses.includes(o.status)),
  }));

  // Update order status
  const updateStatus = async (order: Order, newStatus: OrderStatus) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${order._id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      toast.success(`Order #${order.orderId} → ${newStatus.replace(/_/g, ' ')}`);
      onOrderUpdated();
      onSelectOrder(null);
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  // Mark as paid
  const markAsPaid = async (paymentMethod: PaymentMethod) => {
    if (!selectedOrder) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${selectedOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPaid: true,
          paymentMethod,
          paidAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error('Failed to update payment');

      toast.success(`Order #${selectedOrder.orderId} marked as paid`);
      onOrderUpdated();
    } catch (error) {
      toast.error('Failed to update payment');
    } finally {
      setLoading(false);
    }
  };

  // Get color classes
  const getColorClasses = (color: string, isSelected: boolean) => {
    const colors: Record<string, string> = {
      blue: isSelected ? 'bg-blue-100 border-blue-400' : 'bg-blue-50 border-transparent hover:border-blue-200',
      amber: isSelected ? 'bg-amber-100 border-amber-400' : 'bg-amber-50 border-transparent hover:border-amber-200',
      green: isSelected ? 'bg-green-100 border-green-400' : 'bg-green-50 border-transparent hover:border-green-200',
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="w-[320px] bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">Active Orders</h2>
      </div>

      {/* Orders List */}
      <div className="flex-1 overflow-y-auto p-3">
        {groupedOrders.map(group => (
          <div key={group.key} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-600">{group.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold
                ${group.color === 'blue' ? 'bg-blue-100 text-blue-700' : ''}
                ${group.color === 'amber' ? 'bg-amber-100 text-amber-700' : ''}
                ${group.color === 'green' ? 'bg-green-100 text-green-700' : ''}`}
              >
                {group.orders.length}
              </span>
            </div>

            {group.orders.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-2">No orders</div>
            ) : (
              <div className="space-y-2">
                {group.orders.map(order => (
                  <button
                    key={order._id}
                    onClick={() => onSelectOrder(selectedOrder?._id === order._id ? null : order)}
                    className={`w-full p-3 text-left rounded-xl border-2 active:scale-[0.98] transition-all touch-manipulation
                      ${getColorClasses(group.color, selectedOrder?._id === order._id)}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-gray-800">#{order.orderId}</div>
                        <div className="text-sm text-gray-600">{order.customerName}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-800">
                          ${(order.totalAmount || 0).toFixed(2)}
                        </div>
                        {order.isPaid ? (
                          <span className="text-xs text-green-600 font-medium">PAID</span>
                        ) : (
                          <span className="text-xs text-red-500 font-medium">UNPAID</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selected Order Actions */}
      {selectedOrder && (
        <div className="p-3 border-t border-gray-200 bg-gray-50 space-y-3">
          {/* Order Info */}
          <div className="p-3 bg-white rounded-xl border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-lg">Order #{selectedOrder.orderId}</span>
              <span className={`px-2 py-1 rounded-lg text-xs font-semibold
                ${selectedOrder.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {selectedOrder.isPaid ? 'PAID' : 'UNPAID'}
              </span>
            </div>
            <div className="text-sm text-gray-600">{selectedOrder.customerName}</div>
            <div className="text-lg font-semibold text-gray-800 mt-1">
              ${(selectedOrder.totalAmount || 0).toFixed(2)}
            </div>
          </div>

          {/* Status Update */}
          {NEXT_STATUS_MAP[selectedOrder.status] && (
            <button
              onClick={() => updateStatus(selectedOrder, NEXT_STATUS_MAP[selectedOrder.status])}
              disabled={loading}
              className="w-full min-h-[50px] px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-transform touch-manipulation disabled:opacity-50"
            >
              → {NEXT_STATUS_MAP[selectedOrder.status].replace(/_/g, ' ').toUpperCase()}
            </button>
          )}

          {/* Payment Buttons (if not paid) */}
          {!selectedOrder.isPaid && (
            <>
              <div className="text-sm font-medium text-gray-500">Mark as Paid:</div>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(method => (
                  <button
                    key={method.value}
                    onClick={() => markAsPaid(method.value)}
                    disabled={loading}
                    className={`min-h-[50px] px-3 py-2 font-semibold rounded-xl active:scale-95 transition-transform touch-manipulation disabled:opacity-50
                      ${method.color === 'green' ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''}
                      ${method.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''}
                      ${method.color === 'purple' ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : ''}
                      ${method.color === 'gray' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : ''}`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Complete Button (for ready orders) */}
          {['ready_for_pickup', 'ready_for_delivery'].includes(selectedOrder.status) && (
            <button
              onClick={() => updateStatus(selectedOrder, 'completed')}
              disabled={loading}
              className="w-full min-h-[50px] px-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 active:scale-95 transition-transform touch-manipulation disabled:opacity-50"
            >
              Complete Order
            </button>
          )}
        </div>
      )}
    </div>
  );
}
