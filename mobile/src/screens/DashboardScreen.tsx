import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { Order } from '../types';

type FilterType = 'all' | 'in-store' | 'delivery' | 'new_order' | 'processing' | 'ready' | 'completed';

// Format date as "Tue - Oct 08, 11:45 AM"
function formatOrderDate(dateStr: string | Date | undefined): string {
  if (!dateStr) return 'Not set';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Not set';

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate().toString().padStart(2, '0');

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${dayName} - ${monthName} ${dayNum}, ${hours}:${minutes} ${ampm}`;
}

// Status groups matching web app
const STATUS_GROUPS: Record<string, string[]> = {
  new_order: ['new_order', 'received', 'scheduled_pickup'],
  processing: ['in_washer', 'in_dryer', 'laid_on_cart', 'folding'],
  ready: ['ready_for_pickup', 'ready_for_delivery', 'picked_up'],
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  // QR Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualOrderInput, setManualOrderInput] = useState('');
  const hasScannedRef = useRef(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
    } catch (error) {
      console.error('Failed to load orders:', error);
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Reload orders when screen comes into focus (e.g., after creating an order)
  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  // Auto-refresh orders every 10 seconds
  useAutoRefresh(loadOrders);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, [loadOrders]);

  // QR Scanner functions
  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to scan QR codes');
        return;
      }
    }
    hasScannedRef.current = false;
    setShowScanner(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;

    // Check if this is a customer QR code
    if (data.startsWith('CUSTOMER:')) {
      const customerId = data.replace('CUSTOMER:', '').trim();
      setShowScanner(false);
      navigation.navigate('EditCustomer', { customerId });
      return;
    }

    const orderNum = data.replace(/^#/, '').trim();
    findOrderByNumber(orderNum);
  };

  const findOrderByNumber = (orderNum: string) => {
    const num = orderNum.replace(/^#/, '').trim();
    const found = orders.find(o =>
      o.orderId?.toString() === num ||
      o._id?.slice(-6) === num ||
      o._id === num
    );

    if (found) {
      setShowScanner(false);
      setManualOrderInput('');
      navigation.navigate('OrderDetail', { orderId: found._id });
    } else {
      // Keep hasScannedRef true while alert is showing to prevent loop
      // Only reset when user dismisses the alert
      Alert.alert('Not Found', `Order #${num} not found`, [
        {
          text: 'OK',
          onPress: () => {
            hasScannedRef.current = false;
          },
        },
      ]);
    }
  };

  const filteredOrders = orders
    .filter(order => {
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
        default: // 'all'
          return order.status !== 'completed';
      }
    })
    // Sort by closest pickup/delivery time first
    .sort((a, b) => {
      const dateA = new Date(a.estimatedPickupDate || a.deliverySchedule || 0).getTime();
      const dateB = new Date(b.estimatedPickupDate || b.deliverySchedule || 0).getTime();
      // Orders without dates go to the bottom
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    });

  const getStatusColor = (status: string) => {
    // Match web status colors
    if (STATUS_GROUPS.new_order.includes(status)) return '#3b82f6'; // blue
    if (STATUS_GROUPS.processing.includes(status)) return '#f59e0b'; // amber
    if (STATUS_GROUPS.ready.includes(status)) return '#10b981'; // green
    if (status === 'out_for_delivery') return '#8b5cf6'; // purple
    if (status === 'completed') return '#6b7280'; // gray
    return '#94a3b8';
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getCounts = () => {
    return {
      all: orders.filter(o => o.status !== 'completed').length,
      inStore: orders.filter(o => o.orderType === 'storePickup' && o.status !== 'completed').length,
      delivery: orders.filter(o => o.orderType === 'delivery' && o.status !== 'completed').length,
      newOrder: orders.filter(o => STATUS_GROUPS.new_order.includes(o.status)).length,
      processing: orders.filter(o => STATUS_GROUPS.processing.includes(o.status)).length,
      ready: orders.filter(o => STATUS_GROUPS.ready.includes(o.status)).length,
      completed: orders.filter(o => o.status === 'completed').length,
    };
  };

  const counts = getCounts();

  const renderOrderCard = ({ item: order }: { item: Order }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { orderId: order._id })}
    >
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderNumber}>#{order.orderId}</Text>
          <Text style={styles.customerName}>{order.customerName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
          <Text style={styles.statusText}>{getStatusLabel(order.status)}</Text>
        </View>
      </View>

      <View style={styles.orderDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={16} color="#64748b" />
          <Text style={styles.detailText}>{order.customerPhone}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="scale-outline" size={16} color="#64748b" />
          <Text style={styles.detailText}>{order.weight || 0} lbs</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name={order.orderType === 'delivery' ? 'car-outline' : 'storefront-outline'} size={16} color="#64748b" />
          <Text style={styles.detailText}>{order.orderType === 'delivery' ? 'Delivery' : 'Store Pickup'}</Text>
        </View>
      </View>

      <View style={styles.orderFooter}>
        <Text style={styles.orderAmount}>${(order.totalAmount || 0).toFixed(2)}</Text>
        <Text style={styles.orderDate}>
          {formatOrderDate(order.estimatedPickupDate || order.deliverySchedule)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const filters: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'in-store', label: 'In-Store', count: counts.inStore },
    { key: 'delivery', label: 'Delivery', count: counts.delivery },
    { key: 'new_order', label: 'New', count: counts.newOrder },
    { key: 'processing', label: 'Processing', count: counts.processing },
    { key: 'ready', label: 'Ready', count: counts.ready },
    { key: 'completed', label: 'Completed', count: counts.completed },
  ];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSubtitle}>Welcome, {user?.firstName || 'User'}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal={true}
          data={filters}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterTab,
                filter === item.key && styles.filterTabActive,
              ]}
              onPress={() => setFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterTabText,
                  filter === item.key && styles.filterTabTextActive,
                ]}
              >
                {item.label}
              </Text>
              <View style={[
                styles.filterBadge,
                filter === item.key && styles.filterBadgeActive,
              ]}>
                <Text style={[
                  styles.filterBadgeText,
                  filter === item.key && styles.filterBadgeTextActive,
                ]}>
                  {item.count}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filterList}
        />
      </View>

      {/* Orders List */}
      <FlatList
        data={filteredOrders}
        renderItem={renderOrderCard}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.ordersList}
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>No orders found</Text>
          </View>
        }
      />

      {/* QR Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan Order QR Code</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowScanner(false)}
            >
              <Ionicons name="close" size={28} color="#1e293b" />
            </TouchableOpacity>
          </View>

          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />

          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
          </View>

          <View style={styles.manualInputContainer}>
            <Text style={styles.orText}>or enter order number</Text>
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                value={manualOrderInput}
                onChangeText={setManualOrderInput}
                placeholder="Order #"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                onSubmitEditing={() => {
                  if (manualOrderInput) findOrderByNumber(manualOrderInput);
                }}
              />
              <TouchableOpacity
                style={styles.findButton}
                onPress={() => {
                  if (manualOrderInput) findOrderByNumber(manualOrderInput);
                }}
              >
                <Text style={styles.findButtonText}>Find</Text>
              </TouchableOpacity>
            </View>

            {/* Recent Orders */}
            <Text style={styles.recentLabel}>Recent Orders</Text>
            <View style={styles.recentOrders}>
              {orders.slice(0, 6).map(order => (
                <TouchableOpacity
                  key={order._id}
                  style={styles.recentOrderButton}
                  onPress={() => {
                    setShowScanner(false);
                    navigation.navigate('OrderDetail', { orderId: order._id });
                  }}
                >
                  <Text style={styles.recentOrderText}>#{order.orderId}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    backgroundColor: '#fff',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#2563eb',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterBadgeTextActive: {
    color: '#fff',
  },
  ordersList: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  customerName: {
    fontSize: 16,
    color: '#475569',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#64748b',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  orderAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  orderDate: {
    fontSize: 14,
    color: '#94a3b8',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
  },
  // Scanner styles
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  closeButton: {
    padding: 4,
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  manualInputContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  orText: {
    textAlign: 'center',
    color: '#64748b',
    marginBottom: 12,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#1e293b',
  },
  findButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  findButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 8,
  },
  recentOrders: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentOrderButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  recentOrderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
});
