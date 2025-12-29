'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Order, OrderStatus } from '@/types';
import type { CurrentUser } from '@/lib/auth/server';
import OrderCard from './orders/OrderCard';
import CreateOrderModal from './orders/CreateOrderModal';
import OrderDetailModal from './orders/OrderDetailModal';

interface DashboardClientProps {
  initialOrders: Order[];
  user: CurrentUser | null;
}

type FilterType = 'all' | 'in-store' | 'delivery' | 'new_order' | 'processing' | 'ready' | 'completed';

const STATUS_GROUPS: Record<string, OrderStatus[]> = {
  new_order: ['new_order', 'received', 'scheduled_pickup'],
  processing: ['in_washer', 'in_dryer', 'laid_on_cart', 'folding'],
  ready: ['ready_for_pickup', 'ready_for_delivery', 'picked_up'],
};

export default function DashboardClient({ initialOrders, user }: DashboardClientProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(user);

  // Fetch current user if not provided from server
  useEffect(() => {
    if (!currentUser) {
      fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data._id) {
            setCurrentUser({
              userId: data._id,
              email: data.email,
              name: `${data.firstName} ${data.lastName}`,
              role: data.role,
            });
          }
        })
        .catch(err => console.error('Failed to fetch user:', err));
    }
  }, [currentUser]);

  // Refresh orders
  const loadOrders = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const response = await fetch('/api/orders', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
      if (showLoading) toast.error('Failed to refresh orders');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadOrders(false); // Silent refresh without loading indicator
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Filter orders based on selected filter
  const filteredOrders = orders.filter(order => {
    switch (filter) {
      case 'in-store':
        return order.orderType === 'storePickup' && order.status !== 'completed';
      case 'delivery':
        return order.orderType === 'delivery' && order.status !== 'completed';
      case 'new_order':
        return STATUS_GROUPS.new_order.includes(order.status);
      case 'processing':
        return STATUS_GROUPS.processing.includes(order.status);
      case 'ready':
        return STATUS_GROUPS.ready.includes(order.status);
      case 'completed':
        return order.status === 'completed';
      default:
        return order.status !== 'completed';
    }
  });

  // Handle logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login');
    }
  };

  // Get status counts for badges
  const getCounts = () => {
    const counts = {
      all: orders.filter(o => o.status !== 'completed').length,
      'in-store': orders.filter(o => o.orderType === 'storePickup' && o.status !== 'completed').length,
      delivery: orders.filter(o => o.orderType === 'delivery' && o.status !== 'completed').length,
      new_order: orders.filter(o => STATUS_GROUPS.new_order.includes(o.status)).length,
      processing: orders.filter(o => STATUS_GROUPS.processing.includes(o.status)).length,
      ready: orders.filter(o => STATUS_GROUPS.ready.includes(o.status)).length,
      completed: orders.filter(o => o.status === 'completed').length,
    };
    return counts;
  };

  const counts = getCounts();
  const canManage = currentUser && ['super_admin', 'admin', 'supervisor'].includes(currentUser.role);
  const canDrive = currentUser && ['super_admin', 'admin', 'driver'].includes(currentUser.role);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 md:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">
                Dashboard
              </h1>
              <button
                onClick={handleLogout}
                className="md:hidden px-3 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden md:inline text-sm text-slate-600 mr-2">
                {currentUser?.name} ({currentUser?.role})
              </span>

              {canManage && (
                <button
                  onClick={() => router.push('/admin')}
                  className="px-3 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
                >
                  Admin
                </button>
              )}

              {canDrive && (
                <button
                  onClick={() => router.push('/driver')}
                  className="px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                  Driver
                </button>
              )}

              <button
                onClick={() => router.push('/profile')}
                className="px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                Profile
              </button>

              {canManage && (
                <>
                  <button
                    onClick={() => router.push('/cashier-report')}
                    className="px-3 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
                  >
                    Cashier
                  </button>
                  <button
                    onClick={() => router.push('/eod-report')}
                    className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
                  >
                    EOD
                  </button>
                </>
              )}

              <button
                onClick={handleLogout}
                className="hidden md:inline-flex px-3 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 md:p-6">
        {/* Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'in-store', label: 'In-Store' },
              { key: 'delivery', label: 'Delivery' },
              { key: 'new_order', label: 'New' },
              { key: 'processing', label: 'Processing' },
              { key: 'ready', label: 'Ready' },
              { key: 'completed', label: 'Completed' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key as FilterType)}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  filter === key
                    ? key === 'completed'
                      ? 'bg-green-600 text-white'
                      : 'bg-blue-600 text-white'
                    : key === 'completed'
                      ? 'bg-white text-green-700 border border-green-300 hover:border-green-500'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'
                }`}
              >
                {label}
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    filter === key
                      ? 'bg-white/20 text-white'
                      : key === 'completed'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {counts[key as keyof typeof counts]}
                </span>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => loadOrders()}
              disabled={loading}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Order
            </button>
          </div>
        </div>

        {/* Orders Grid */}
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <div className="text-slate-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-slate-500">No orders found</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredOrders.map(order => (
              <OrderCard
                key={order._id}
                order={order}
                onRefresh={loadOrders}
                onSelect={() => setSelectedOrder(order)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Order Modal */}
      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadOrders();
          }}
        />
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdate={() => {
            loadOrders();
          }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
