'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import type { Order, OrderStatus } from '@/types';

interface OrderCardProps {
  order: Order;
  onRefresh: () => void;
  onSelect?: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  new_order: 'New Order',
  received: 'Received',
  in_washer: 'In Washer',
  in_dryer: 'In Dryer',
  laid_on_cart: 'On Cart',
  folding: 'Folding',
  ready_for_pickup: 'Ready for Pickup',
  ready_for_delivery: 'Ready for Delivery',
  completed: 'Completed',
  scheduled_pickup: 'Scheduled Pickup',
  picked_up: 'Picked Up',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  new_order: 'bg-blue-100 text-blue-800',
  received: 'bg-blue-100 text-blue-800',
  in_washer: 'bg-amber-100 text-amber-800',
  in_dryer: 'bg-amber-100 text-amber-800',
  laid_on_cart: 'bg-amber-100 text-amber-800',
  folding: 'bg-amber-100 text-amber-800',
  ready_for_pickup: 'bg-green-100 text-green-800',
  ready_for_delivery: 'bg-green-100 text-green-800',
  completed: 'bg-slate-100 text-slate-800',
  scheduled_pickup: 'bg-purple-100 text-purple-800',
  picked_up: 'bg-emerald-100 text-emerald-800',
};

const STATUS_FLOW: OrderStatus[] = [
  'new_order',
  'received',
  'in_washer',
  'in_dryer',
  'laid_on_cart',
  'folding',
  'ready_for_pickup',
  'completed',
];

export default function OrderCard({ order, onRefresh, onSelect }: OrderCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getNextStatus = (): OrderStatus | null => {
    const currentIndex = STATUS_FLOW.indexOf(order.status);
    if (currentIndex === -1 || currentIndex >= STATUS_FLOW.length - 1) {
      return null;
    }
    // Handle delivery orders differently
    if (order.orderType === 'delivery' && order.status === 'folding') {
      return 'ready_for_delivery';
    }
    return STATUS_FLOW[currentIndex + 1];
  };

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/orders/${order._id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
      onRefresh();
    } catch (error) {
      console.error('Status update error:', error);
      toast.error('Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const nextStatus = getNextStatus();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header - Clickable to open detail modal */}
      <div
        className="p-4 border-b border-slate-100 cursor-pointer active:bg-slate-50"
        onClick={onSelect}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-slate-800">#{order.orderId}</span>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  order.orderType === 'delivery'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {order.orderType === 'delivery' ? 'Delivery' : 'Pickup'}
              </span>
            </div>
            <p className="text-sm text-slate-600">{order.customerName}</p>
            {order.customerPhone && (
              <p className="text-xs text-slate-400">{order.customerPhone}</p>
            )}
          </div>
          <span
            className={`px-2 py-1 text-xs font-medium rounded-lg ${
              STATUS_COLORS[order.status]
            }`}
          >
            {STATUS_LABELS[order.status]}
          </span>
        </div>
        {/* Tap indicator for mobile */}
        <div className="mt-2 flex items-center text-xs text-blue-500 md:hidden">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Tap to view details & scan
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Weight</span>
            <p className="font-medium text-slate-800">{order.weight} lbs</p>
          </div>
          <div>
            <span className="text-slate-500">Total</span>
            <p className="font-medium text-slate-800">
              {formatCurrency(order.totalAmount)}
            </p>
          </div>
          {order.orderType === 'delivery' ? (
            <>
              <div>
                <span className="text-slate-500">Pickup From Customer</span>
                <p className="font-medium text-slate-800">
                  {order.scheduledPickupTime
                    ? formatDate(order.scheduledPickupTime)
                    : order.estimatedPickupDate
                      ? formatDate(order.estimatedPickupDate)
                      : 'Not scheduled'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Delivery</span>
                <p className="font-medium text-slate-800">
                  {order.deliverySchedule
                    ? formatDate(order.deliverySchedule)
                    : 'Not scheduled'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-slate-500">Drop Off</span>
                <p className="font-medium text-slate-800">
                  {order.dropOffDate ? formatDate(order.dropOffDate) : 'N/A'}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Ready By</span>
                <p className="font-medium text-slate-800">
                  {order.estimatedPickupDate
                    ? formatDate(order.estimatedPickupDate)
                    : 'N/A'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Bags */}
        {order.bags && order.bags.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {order.bags.length} bag{order.bags.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Payment Status */}
        <div className="mt-3 flex items-center gap-2">
          {order.isPaid ? (
            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Paid
              {order.paymentMethod && ` (${order.paymentMethod})`}
            </span>
          ) : (
            <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
              Unpaid
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex-1 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>

        {nextStatus && (
          <button
            onClick={() => handleStatusUpdate(nextStatus)}
            disabled={isUpdating}
            className="flex-1 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors"
          >
            {isUpdating ? 'Updating...' : `→ ${STATUS_LABELS[nextStatus]}`}
          </button>
        )}

        {order.status !== 'completed' && !nextStatus && (
          <button
            onClick={() => handleStatusUpdate('completed')}
            disabled={isUpdating}
            className="flex-1 py-2 text-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition-colors"
          >
            {isUpdating ? 'Completing...' : 'Complete'}
          </button>
        )}
      </div>

      {/* Details Panel */}
      {showDetails && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4">
          {order.specialInstructions && (
            <div className="mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase">
                Special Instructions
              </span>
              <p className="text-sm text-slate-700 mt-1">
                {order.specialInstructions}
              </p>
            </div>
          )}

          {order.bags && order.bags.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-medium text-slate-500 uppercase">
                Bags
              </span>
              <div className="mt-1 space-y-1">
                {order.bags.map((bag, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-600">
                      {bag.identifier}
                      {bag.color && ` (${bag.color})`}
                    </span>
                    <span className="text-slate-800 font-medium">
                      {bag.weight} lbs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {order.statusHistory && order.statusHistory.length > 0 && (
            <div>
              <span className="text-xs font-medium text-slate-500 uppercase">
                History
              </span>
              <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                {order.statusHistory.slice(-5).reverse().map((entry, index) => (
                  <div key={index} className="text-xs text-slate-500">
                    {STATUS_LABELS[entry.status as OrderStatus]} -{' '}
                    {formatDate(entry.changedAt)} by {entry.changedBy}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
