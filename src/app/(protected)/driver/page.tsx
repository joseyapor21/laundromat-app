'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Order, Customer } from '@/types';
import { useBluetoothPrinter } from '@/services/client/bluetoothPrinterService';

// Store location (can be configured in settings)
const STORE_LOCATION = {
  lat: 40.7128, // Default NYC - will be updated from settings
  lng: -74.0060,
  address: 'Store Location'
};

interface OrderWithDistance extends Order {
  distance?: number;
  distanceText?: string;
  duration?: string;
  coordinates?: { lat: number; lng: number };
  // customer is already part of Order type from API population
}

export default function DriverPage() {
  const router = useRouter();
  const [pickupOrders, setPickupOrders] = useState<OrderWithDistance[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<OrderWithDistance[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [loading, setLoading] = useState(true);
  const [calculatingRoutes, setCalculatingRoutes] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [printQuantity, setPrintQuantity] = useState('1');
  const [activeTab, setActiveTab] = useState<'pickups' | 'deliveries'>('pickups');
  const [sortByRoute, setSortByRoute] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodingProgress, setGeocodingProgress] = useState<string>('');

  // Bluetooth printer hook
  const {
    isConnected: bluetoothConnected,
    isConnecting: bluetoothConnecting,
    error: bluetoothError,
    connect: connectBluetooth,
    disconnect: disconnectBluetooth,
    printLabel: bluetoothPrintLabel
  } = useBluetoothPrinter();

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Geolocation error:', error);
          // Use store location as fallback
          setCurrentLocation(STORE_LOCATION);
        }
      );
    }
  }, []);

  useEffect(() => {
    loadDriverOrders();
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const response = await fetch('/api/customers', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const customerMap: Record<string, Customer> = {};
        data.forEach((c: Customer) => {
          customerMap[c._id] = c;
        });
        setCustomers(customerMap);
      }
    } catch (error) {
      console.error('Failed to load customers:', error);
    }
  };

  // Geocode address to coordinates using OpenStreetMap Nominatim (free)
  const geocodeAddress = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!address || address.trim().length < 5) return null;

    try {
      // Use OpenStreetMap Nominatim for geocoding (free, no API key required)
      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
        {
          headers: {
            'User-Agent': 'LaundryApp/1.0' // Required by Nominatim
          }
        }
      );

      if (!response.ok) {
        console.error('Geocoding failed:', response.status);
        return null;
      }

      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }

      console.log('No geocoding results for:', address);
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }, []);

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Optimize route using nearest neighbor algorithm
  const optimizeRoute = useCallback((orders: OrderWithDistance[], startLat: number, startLng: number): OrderWithDistance[] => {
    if (orders.length <= 1) return orders;

    const remaining = [...orders];
    const optimized: OrderWithDistance[] = [];
    let currentLat = startLat;
    let currentLng = startLng;

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const order = remaining[i];
        if (order.coordinates) {
          const dist = calculateDistance(currentLat, currentLng, order.coordinates.lat, order.coordinates.lng);
          if (dist < nearestDistance) {
            nearestDistance = dist;
            nearestIndex = i;
          }
        }
      }

      const nearest = remaining.splice(nearestIndex, 1)[0];
      if (nearest.coordinates) {
        currentLat = nearest.coordinates.lat;
        currentLng = nearest.coordinates.lng;
      }
      optimized.push(nearest);
    }

    return optimized;
  }, [calculateDistance]);

  const loadDriverOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/orders', { credentials: 'include' });
      if (response.ok) {
        const allOrders = await response.json();

        // Filter pickup orders: delivery type orders that need to be picked up
        const pickups = allOrders.filter((order: Order) =>
          order.orderType === 'delivery' &&
          ['new_order', 'scheduled_pickup', 'picked_up'].includes(order.status)
        );

        // Filter delivery orders: ready for delivery
        const deliveries = allOrders.filter((order: Order) =>
          order.orderType === 'delivery' &&
          order.status === 'ready_for_delivery'
        );

        setPickupOrders(pickups);
        setDeliveryOrders(deliveries);
      }
    } catch (error) {
      console.error('Failed to load driver orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  // Calculate routes for all orders
  const calculateRoutes = useCallback(async () => {
    if (!currentLocation) {
      toast.error('Unable to get current location');
      return;
    }

    setCalculatingRoutes(true);

    try {
      // Helper function to add delay between geocoding requests (Nominatim rate limit: 1 req/sec)
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Add coordinates and distances to pickup orders (sequential to respect rate limits)
      const pickupsWithCoords: OrderWithDistance[] = [];
      for (const order of pickupOrders) {
        // Use customer from order (populated by API) or fall back to customers lookup
        const customer = order.customer || customers[order.customerId];
        const address = customer?.address;
        const coords = address ? await geocodeAddress(address) : null;
        const distance = coords ? calculateDistance(currentLocation.lat, currentLocation.lng, coords.lat, coords.lng) : null;

        pickupsWithCoords.push({
          ...order,
          coordinates: coords || undefined,
          distance: distance || undefined,
          distanceText: distance ? `${distance.toFixed(1)} mi` : 'N/A',
          duration: distance ? `${Math.round(distance * 3)}min` : 'N/A' // Rough estimate: 3 min per mile
        });

        // Add delay between requests to respect rate limit
        if (address) await delay(1100);
      }

      // Add coordinates and distances to delivery orders (sequential to respect rate limits)
      const deliveriesWithCoords: OrderWithDistance[] = [];
      for (const order of deliveryOrders) {
        // Use customer from order (populated by API) or fall back to customers lookup
        const customer = order.customer || customers[order.customerId];
        const address = customer?.address;
        const coords = address ? await geocodeAddress(address) : null;
        const distance = coords ? calculateDistance(currentLocation.lat, currentLocation.lng, coords.lat, coords.lng) : null;

        deliveriesWithCoords.push({
          ...order,
          coordinates: coords || undefined,
          distance: distance || undefined,
          distanceText: distance ? `${distance.toFixed(1)} mi` : 'N/A',
          duration: distance ? `${Math.round(distance * 3)}min` : 'N/A'
        });

        // Add delay between requests to respect rate limit
        if (address) await delay(1100);
      }

      // Optimize routes
      const optimizedPickups = optimizeRoute(pickupsWithCoords, currentLocation.lat, currentLocation.lng);
      const optimizedDeliveries = optimizeRoute(deliveriesWithCoords, currentLocation.lat, currentLocation.lng);

      setPickupOrders(optimizedPickups);
      setDeliveryOrders(optimizedDeliveries);
      setSortByRoute(true);
      toast.success('Routes optimized!');
    } catch (error) {
      console.error('Failed to calculate routes:', error);
      toast.error('Failed to calculate routes');
    } finally {
      setCalculatingRoutes(false);
    }
  }, [currentLocation, pickupOrders, deliveryOrders, customers, geocodeAddress, calculateDistance, optimizeRoute]);

  // Open multi-stop route in maps
  const openRouteInMaps = useCallback((orders: OrderWithDistance[]) => {
    const ordersWithAddresses = orders
      .map(order => (order.customer || customers[order.customerId])?.address)
      .filter(Boolean);

    if (ordersWithAddresses.length === 0) {
      toast.error('No addresses available for navigation');
      return;
    }

    // Build Google Maps multi-stop URL
    const origin = currentLocation
      ? `${currentLocation.lat},${currentLocation.lng}`
      : STORE_LOCATION.address;

    const waypoints = ordersWithAddresses.slice(0, -1).map(addr => encodeURIComponent(addr!)).join('|');
    const destination = encodeURIComponent(ordersWithAddresses[ordersWithAddresses.length - 1]!);

    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) {
      mapsUrl += `&waypoints=${waypoints}`;
    }
    mapsUrl += '&travelmode=driving';

    window.open(mapsUrl, '_blank');
  }, [currentLocation, customers]);

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      await loadDriverOrders();
      toast.success('Order status updated');
    } catch (error) {
      console.error('Failed to update order status:', error);
      toast.error('Failed to update order status');
    }
  };

  const handlePrintLabel = async (order: Order, quantity: number = 1) => {
    const orderKey = order._id;
    setPrintingOrderId(orderKey);

    try {
      // Use customer from order (populated by API) or fall back to customers lookup
      const customer = order.customer || customers[order.customerId];

      const orderData = {
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        orderId: order.orderId?.toString() || order._id.slice(-6),
        address: customer?.address || '',
        serviceType: order.items?.[0]?.serviceName || 'Standard Wash',
        orderType: order.orderType === 'delivery' ? 'Pickup & Delivery' : 'Store Pickup',
        weight: order.weight || 0,
        notes: order.specialInstructions || '',
        _id: orderKey
      };

      if (!bluetoothConnected) {
        toast.error('Bluetooth printer not connected. Please connect first.');
        return;
      }

      await bluetoothPrintLabel(orderData, quantity);
      toast.success(`Label printed for ${orderData.customerName}`);

      if (order.status === 'new_order' || order.status === 'scheduled_pickup') {
        await handleStatusUpdate(orderKey, 'picked_up');
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error('Failed to print label');
    } finally {
      setPrintingOrderId(null);
    }
  };

  const handlePrintWithQuantity = async () => {
    if (!selectedOrderForPrint) return;

    const quantity = parseInt(printQuantity);
    if (isNaN(quantity) || quantity < 1 || quantity > 10) {
      toast.error('Please enter a valid quantity (1-10)');
      return;
    }

    setSelectedOrderForPrint(null);
    setPrintQuantity('1');
    await handlePrintLabel(selectedOrderForPrint, quantity);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'new_order': return { bg: 'bg-blue-500', text: 'text-white', label: 'New' };
      case 'scheduled_pickup': return { bg: 'bg-amber-500', text: 'text-white', label: 'Scheduled' };
      case 'picked_up': return { bg: 'bg-emerald-500', text: 'text-white', label: 'Picked Up' };
      case 'ready_for_delivery': return { bg: 'bg-indigo-500', text: 'text-white', label: 'Ready' };
      default: return { bg: 'bg-slate-500', text: 'text-white', label: status.replace(/_/g, ' ') };
    }
  };

  const activeOrders = activeTab === 'pickups' ? pickupOrders : deliveryOrders;
  const totalDistance = useMemo(() => {
    return activeOrders.reduce((sum, order) => sum + (order.distance || 0), 0);
  }, [activeOrders]);

  const renderOrderCard = (order: OrderWithDistance, index: number, isPickup: boolean) => {
    // Use customer from order (populated by API) or fall back to customers lookup
    const customer = order.customer || customers[order.customerId];
    const statusConfig = getStatusConfig(order.status);

    return (
      <div
        key={order._id}
        className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow"
      >
        {/* Card Header */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {sortByRoute && (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
                {index + 1}
              </div>
            )}
            <div>
              <div className="text-white font-semibold">#{order.orderId}</div>
              {order.distanceText && (
                <div className="text-slate-300 text-xs flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {order.distanceText} • {order.duration}
                </div>
              )}
            </div>
          </div>
          <span className={`${statusConfig.bg} ${statusConfig.text} px-3 py-1 rounded-full text-xs font-medium`}>
            {statusConfig.label}
          </span>
        </div>

        {/* Customer Info */}
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-slate-800 text-lg">{order.customerName}</h3>
              <a href={`tel:${order.customerPhone}`} className="text-blue-600 text-sm flex items-center gap-1 hover:underline">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {order.customerPhone}
              </a>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-800">${(order.totalAmount || 0).toFixed(2)}</div>
              <div className="text-slate-500 text-sm">{order.weight ? `${order.weight} lbs` : 'Weight TBD'}</div>
            </div>
          </div>

          {/* Address */}
          {customer?.address && (
            <div className="bg-slate-50 rounded-xl p-3 mb-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-slate-700 text-sm">{customer.address}</span>
              </div>
            </div>
          )}

          {/* Schedule Info */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="bg-slate-100 px-3 py-1.5 rounded-lg text-xs">
              <span className="text-slate-500">Created:</span>
              <span className="text-slate-700 font-medium ml-1">{formatDate(order.dropOffDate)}</span>
            </div>
            {order.scheduledPickupTime && (
              <div className="bg-amber-100 px-3 py-1.5 rounded-lg text-xs">
                <span className="text-amber-600">Scheduled:</span>
                <span className="text-amber-800 font-medium ml-1">{formatDate(order.scheduledPickupTime)}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          {order.specialInstructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="text-amber-800 text-sm">{order.specialInstructions}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {/* Navigate Button */}
            {customer?.address && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customer.address)}&travelmode=driving`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Navigate
              </a>
            )}

            {/* Call Button */}
            {order.customerPhone && (
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call
              </a>
            )}

            {/* Print Label Button - Pickup only */}
            {isPickup && (
              <button
                onClick={() => setSelectedOrderForPrint(order)}
                disabled={!bluetoothConnected || printingOrderId === order._id}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-colors ${
                  bluetoothConnected
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {printingOrderId === order._id ? 'Printing...' : 'Print Label'}
              </button>
            )}

            {/* Status Action Button */}
            {isPickup ? (
              order.status === 'new_order' || order.status === 'scheduled_pickup' ? (
                <button
                  onClick={() => handleStatusUpdate(order._id, 'picked_up')}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Picked Up
                </button>
              ) : order.status === 'picked_up' ? (
                <button
                  onClick={() => handleStatusUpdate(order._id, 'received')}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  At Store
                </button>
              ) : null
            ) : (
              <button
                onClick={() => handleStatusUpdate(order._id, 'completed')}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors col-span-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Mark Delivered
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Driver Dashboard</h1>
              <p className="text-slate-500 text-sm">Manage pickups and deliveries</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Bluetooth Status */}
          <div className={`flex items-center justify-between p-3 rounded-xl mb-4 ${
            bluetoothConnected ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-100 border border-slate-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${bluetoothConnected ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
              <span className={`text-sm font-medium ${bluetoothConnected ? 'text-emerald-700' : 'text-slate-600'}`}>
                {bluetoothConnected ? 'Printer Connected' : 'Printer Disconnected'}
              </span>
            </div>
            <button
              onClick={bluetoothConnected ? disconnectBluetooth : connectBluetooth}
              disabled={bluetoothConnecting}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                bluetoothConnected
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {bluetoothConnecting ? 'Connecting...' : bluetoothConnected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
          {bluetoothError && (
            <div className="text-red-600 text-xs mb-4 px-1">{bluetoothError}</div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('pickups')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'pickups'
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Pickups
                <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {pickupOrders.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('deliveries')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all ${
                activeTab === 'deliveries'
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                Deliveries
                <span className="bg-indigo-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {deliveryOrders.length}
                </span>
              </div>
            </button>
          </div>
        </div>
      </header>

      <main className="p-4">
        {/* Route Controls */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-slate-800">Route Planning</h3>
              {sortByRoute && activeOrders.length > 0 && (
                <p className="text-slate-500 text-sm">
                  {activeOrders.length} stops • ~{totalDistance.toFixed(1)} miles total
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={calculateRoutes}
                disabled={calculatingRoutes || activeOrders.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {calculatingRoutes ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Optimizing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Optimize Route
                  </>
                )}
              </button>
              <button
                onClick={() => openRouteInMaps(activeOrders)}
                disabled={activeOrders.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in Maps
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{pickupOrders.length}</div>
              <div className="text-amber-700 text-xs font-medium">Pickups</div>
            </div>
            <div className="bg-indigo-50 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-indigo-600">{deliveryOrders.length}</div>
              <div className="text-indigo-700 text-xs font-medium">Deliveries</div>
            </div>
            <div className="bg-slate-100 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-slate-700">{pickupOrders.length + deliveryOrders.length}</div>
              <div className="text-slate-600 text-xs font-medium">Total Stops</div>
            </div>
          </div>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-800"></div>
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">
              No {activeTab === 'pickups' ? 'pickups' : 'deliveries'} available
            </h3>
            <p className="text-slate-500 text-sm">Check back later for new orders</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeOrders.map((order, index) => renderOrderCard(order, index, activeTab === 'pickups'))}
          </div>
        )}
      </main>

      {/* Print Quantity Modal */}
      {selectedOrderForPrint && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4">
              <h3 className="text-lg font-semibold text-white">Print Labels</h3>
              <p className="text-purple-200 text-sm">Order #{selectedOrderForPrint.orderId}</p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                How many labels do you need?
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={printQuantity}
                onChange={(e) => setPrintQuantity(e.target.value)}
                className="w-full p-4 border-2 border-slate-200 rounded-xl text-lg text-center focus:outline-none focus:border-purple-500 transition-colors"
                autoFocus
              />
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setSelectedOrderForPrint(null);
                    setPrintQuantity('1');
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePrintWithQuantity}
                  className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors"
                >
                  Print Labels
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
