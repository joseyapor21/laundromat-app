'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Html5Qrcode } from 'html5-qrcode';
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
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [manualOrderInput, setManualOrderInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const hasScannedRef = useRef(false);

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

  // Start QR scanner
  const startScanner = useCallback(async () => {
    if (isScanning || !scannerContainerRef.current) return;

    hasScannedRef.current = false;

    try {
      const html5QrCode = new Html5Qrcode('qr-reader', {
        verbose: false,
        formatsToSupport: [0], // QR_CODE only for faster scanning
      });
      html5QrCodeRef.current = html5QrCode;

      // Get available cameras
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        throw new Error('No cameras found');
      }

      // Prefer back camera
      const backCamera = cameras.find(c =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment')
      );
      const cameraId = backCamera ? backCamera.id : cameras[cameras.length - 1].id;

      await html5QrCode.start(
        cameraId,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            // Make scanning area larger - 80% of viewfinder
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.8);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          },
        },
        async (decodedText) => {
          // Prevent multiple scans
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;

          // Stop scanner first
          try {
            await html5QrCode.stop();
            html5QrCodeRef.current = null;
            setIsScanning(false);
          } catch (e) {
            console.error('Error stopping scanner:', e);
          }

          // Then find the order
          const num = decodedText.replace(/^#/, '').trim();
          const found = orders.find(o =>
            o.orderId?.toString() === num ||
            o._id?.slice(-6) === num ||
            o._id === num
          );

          if (found) {
            setSelectedOrder(found);
            setShowQRScanner(false);
            setManualOrderInput('');
            toast.success(`Found order #${num}`);
          } else {
            toast.error(`Order #${num} not found`);
            hasScannedRef.current = false; // Allow retry
          }
        },
        () => {
          // QR code not detected (ignore)
        }
      );

      setIsScanning(true);
    } catch (err) {
      console.error('Failed to start scanner:', err);
      toast.error('Could not access camera. Please enter order number manually.');
    }
  }, [isScanning, orders]);

  // Stop QR scanner
  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current && isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (err) {
        console.error('Failed to stop scanner:', err);
      }
    }
    setIsScanning(false);
  }, [isScanning]);

  // Cleanup scanner when modal closes
  useEffect(() => {
    if (!showQRScanner && isScanning) {
      stopScanner();
    }
  }, [showQRScanner, isScanning, stopScanner]);

  // Find and open order by order number
  const findOrderByNumber = (orderNum: string) => {
    const num = orderNum.replace(/^#/, '').trim();
    const found = orders.find(o =>
      o.orderId?.toString() === num ||
      o._id?.slice(-6) === num ||
      o._id === num
    );

    if (found) {
      setSelectedOrder(found);
      setShowQRScanner(false);
      setManualOrderInput('');
      toast.success(`Found order #${num}`);
    } else {
      toast.error(`Order #${num} not found`);
    }
  };

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
              onClick={() => setShowQRScanner(true)}
              className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Scan QR
            </button>

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

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { stopScanner(); setShowQRScanner(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Find Order</h2>
              <button
                onClick={() => { stopScanner(); setShowQRScanner(false); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Camera Scanner */}
            <div className="mb-4">
              <div
                id="qr-reader"
                ref={scannerContainerRef}
                className="w-full rounded-lg overflow-hidden bg-black"
                style={{ minHeight: isScanning ? '300px' : '0' }}
              ></div>

              {!isScanning ? (
                <button
                  onClick={startScanner}
                  className="w-full py-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Start Camera Scanner
                </button>
              ) : (
                <button
                  onClick={stopScanner}
                  className="w-full py-3 mt-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
                >
                  Stop Scanner
                </button>
              )}
            </div>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">or enter order number</span>
              </div>
            </div>

            {/* Manual Input */}
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={manualOrderInput}
                  onChange={e => setManualOrderInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && manualOrderInput) {
                      findOrderByNumber(manualOrderInput);
                    }
                  }}
                  placeholder="Enter order # (e.g., 123)"
                  className="flex-1 px-4 py-3 text-lg border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => findOrderByNumber(manualOrderInput)}
                  disabled={!manualOrderInput}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Find
                </button>
              </div>

              {/* Recent Orders Quick Access */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium text-gray-700 mb-2">Recent Orders</p>
                <div className="flex flex-wrap gap-2">
                  {orders.slice(0, 8).map(order => (
                    <button
                      key={order._id}
                      onClick={() => {
                        stopScanner();
                        setSelectedOrder(order);
                        setShowQRScanner(false);
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                    >
                      #{order.orderId || order._id?.slice(-6)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
