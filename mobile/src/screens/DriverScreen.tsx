import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Linking,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Device } from 'react-native-ble-plx';
import { api } from '../services/api';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { bluetoothPrinter } from '../services/BluetoothPrinter';
import type { Order } from '../types';

type Tab = 'pickups' | 'deliveries';

export default function DriverScreen() {
  const insets = useSafeAreaInsets();
  const [pickupOrders, setPickupOrders] = useState<Order[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('pickups');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Printer state
  const [printerExpanded, setPrinterExpanded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const allOrders = await api.getOrders();

      // Filter pickup orders
      const pickups = allOrders.filter(order =>
        order.orderType === 'delivery' &&
        ['new_order', 'scheduled_pickup', 'picked_up'].includes(order.status)
      );

      // Filter delivery orders
      const deliveries = allOrders.filter(order =>
        order.orderType === 'delivery' &&
        order.status === 'ready_for_delivery'
      );

      setPickupOrders(pickups);
      setDeliveryOrders(deliveries);
    } catch (error) {
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    checkPrinterConnection();
  }, [loadOrders]);

  // Check printer connection on mount
  async function checkPrinterConnection() {
    const name = bluetoothPrinter.getConnectedDeviceName();
    setConnectedDeviceName(name);

    if (!name) {
      const reconnected = await bluetoothPrinter.reconnectSavedPrinter();
      if (reconnected) {
        setConnectedDeviceName(bluetoothPrinter.getConnectedDeviceName());
      }
    }
  }

  async function startScan() {
    setScanning(true);
    setDevices([]);

    await bluetoothPrinter.startScan((foundDevices) => {
      setDevices(foundDevices);
    });

    setTimeout(() => {
      setScanning(false);
    }, 10000);
  }

  function stopScan() {
    bluetoothPrinter.stopScan();
    setScanning(false);
  }

  async function connectToDevice(device: Device) {
    setConnecting(true);
    stopScan();

    const success = await bluetoothPrinter.connect(device);

    if (success) {
      setConnectedDeviceName(device.name || 'Unknown');
      Alert.alert('Connected', `Successfully connected to ${device.name}`);
    } else {
      Alert.alert('Connection Failed', 'Could not connect to the printer. Please try again.');
    }

    setConnecting(false);
  }

  async function disconnectPrinter() {
    await bluetoothPrinter.disconnect();
    setConnectedDeviceName(null);
    Alert.alert('Disconnected', 'Printer has been disconnected');
  }

  async function testPrint() {
    const success = await bluetoothPrinter.printText(
      'TEST PRINT\n' +
      '--------------------------------\n' +
      'Laundromat App\n' +
      'Printer connected successfully!\n' +
      '--------------------------------\n'
    );

    if (success) {
      Alert.alert('Success', 'Test print sent successfully');
    } else {
      Alert.alert('Error', 'Failed to print. Please check the printer connection.');
    }
  }

  // Print tag for a specific order - asks for number of bags
  async function printOrderTag(order: Order) {
    if (!bluetoothPrinter.isConnected()) {
      Alert.alert(
        'Printer Not Connected',
        'Please connect a Bluetooth printer first',
        [{ text: 'OK', onPress: () => setPrinterExpanded(true) }]
      );
      return;
    }

    // Prompt for number of bags
    Alert.prompt(
      'Number of Bags',
      `How many bag labels for ${order.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Print',
          onPress: async (bagCountStr) => {
            const bagCount = parseInt(bagCountStr || '1', 10);
            if (isNaN(bagCount) || bagCount < 1) {
              Alert.alert('Invalid', 'Please enter a valid number of bags');
              return;
            }

            setPrintingOrderId(order._id);

            const success = await bluetoothPrinter.printMultipleBagLabels({
              orderId: String(order.orderId),
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              address: order.customer?.address,
              weight: order.weight,
              isSameDay: order.isSameDay,
            }, bagCount);

            setPrintingOrderId(null);

            if (success) {
              Alert.alert('Success', `${bagCount} tag(s) printed for ${order.customerName}`);
            } else {
              Alert.alert('Print Failed', 'Could not print. Please check printer connection.');
            }
          },
        },
      ],
      'plain-text',
      '1',
      'number-pad'
    );
  }

  // Reload orders when screen comes into focus
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

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      await api.updateOrderStatus(orderId, newStatus);
      await loadOrders();
      Alert.alert('Success', 'Status updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  }

  function openNavigation(address: string) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
    Linking.openURL(url);
  }

  // Open Google Maps with optimized route for all addresses
  function openOptimizedRoute() {
    const orders = activeTab === 'pickups' ? pickupOrders : deliveryOrders;
    const addresses = orders
      .filter(order => order.customer?.address)
      .map(order => order.customer!.address);

    if (addresses.length === 0) {
      Alert.alert('No Addresses', 'No orders have addresses to navigate to.');
      return;
    }

    if (addresses.length === 1) {
      openNavigation(addresses[0]);
      return;
    }

    // Multiple addresses - use Google Maps with waypoints
    const origin = encodeURIComponent(addresses[0]);
    const destination = encodeURIComponent(addresses[addresses.length - 1]);
    const waypoints = addresses.slice(1, -1).map(encodeURIComponent).join('|');

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }

    Linking.openURL(url);
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'new_order': return { bg: '#3b82f6', label: 'New' };
      case 'scheduled_pickup': return { bg: '#f59e0b', label: 'Scheduled' };
      case 'picked_up': return { bg: '#10b981', label: 'Picked Up' };
      case 'ready_for_delivery': return { bg: '#8b5cf6', label: 'Ready' };
      default: return { bg: '#94a3b8', label: status };
    }
  };

  const renderOrderCard = ({ item: order, index }: { item: Order; index: number }) => {
    const statusConfig = getStatusConfig(order.status);
    const isPickup = activeTab === 'pickups';

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.orderNumber}>
              <Text style={styles.orderNumberText}>{index + 1}</Text>
            </View>
            <View>
              <Text style={styles.orderId}>#{order.orderId}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={styles.statusText}>{statusConfig.label}</Text>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.customerInfo}>
          <Text style={styles.customerName}>{order.customerName}</Text>
          <Text style={styles.customerPhone}>{order.customerPhone}</Text>
          {order.customer?.address && (
            <Text style={styles.customerAddress}>{order.customer.address}</Text>
          )}
        </View>

        {/* Order Info */}
        <View style={styles.orderInfo}>
          <View style={styles.infoItem}>
            <Ionicons name="scale-outline" size={16} color="#64748b" />
            <Text style={styles.infoText}>{order.weight || 0} lbs</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="cash-outline" size={16} color="#64748b" />
            <Text style={styles.infoText}>${(order.totalAmount || 0).toFixed(2)}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {order.customer?.address && (
            <TouchableOpacity
              style={[styles.actionButton, styles.navigateButton]}
              onPress={() => openNavigation(order.customer!.address)}
            >
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Navigate</Text>
            </TouchableOpacity>
          )}

          {isPickup ? (
            order.status === 'new_order' || order.status === 'scheduled_pickup' ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.statusButton]}
                onPress={() => updateStatus(order._id, 'picked_up')}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Picked Up</Text>
              </TouchableOpacity>
            ) : order.status === 'picked_up' ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.storeButton]}
                onPress={() => updateStatus(order._id, 'received')}
              >
                <Ionicons name="storefront" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>At Store</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.statusButton]}
              onPress={() => updateStatus(order._id, 'completed')}
            >
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Delivered</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Print Tag Button */}
        <TouchableOpacity
          style={[styles.printTagButton, printingOrderId === order._id && styles.printingButton]}
          onPress={() => printOrderTag(order)}
          disabled={printingOrderId === order._id}
        >
          {printingOrderId === order._id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="pricetag" size={18} color="#fff" />
          )}
          <Text style={styles.printTagButtonText}>
            {printingOrderId === order._id ? 'Printing...' : 'Print Tag'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const activeOrders = activeTab === 'pickups' ? pickupOrders : deliveryOrders;

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
        <Text style={styles.headerTitle}>Driver Dashboard</Text>
        <Text style={styles.headerSubtitle}>Manage pickups & deliveries</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pickups' && styles.tabActive]}
          onPress={() => setActiveTab('pickups')}
        >
          <Ionicons
            name="arrow-up-circle"
            size={20}
            color={activeTab === 'pickups' ? '#1e293b' : '#94a3b8'}
          />
          <Text style={[styles.tabText, activeTab === 'pickups' && styles.tabTextActive]}>
            Pickups
          </Text>
          <View style={[styles.tabBadge, activeTab === 'pickups' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, activeTab === 'pickups' && styles.tabBadgeTextActive]}>
              {pickupOrders.length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'deliveries' && styles.tabActive]}
          onPress={() => setActiveTab('deliveries')}
        >
          <Ionicons
            name="arrow-down-circle"
            size={20}
            color={activeTab === 'deliveries' ? '#1e293b' : '#94a3b8'}
          />
          <Text style={[styles.tabText, activeTab === 'deliveries' && styles.tabTextActive]}>
            Deliveries
          </Text>
          <View style={[styles.tabBadge, activeTab === 'deliveries' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, activeTab === 'deliveries' && styles.tabBadgeTextActive]}>
              {deliveryOrders.length}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{pickupOrders.length}</Text>
          <Text style={styles.statLabel}>Pickups</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{deliveryOrders.length}</Text>
          <Text style={styles.statLabel}>Deliveries</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{pickupOrders.length + deliveryOrders.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Printer Section */}
      <View style={styles.printerSection}>
        <TouchableOpacity
          style={styles.printerHeader}
          onPress={() => setPrinterExpanded(!printerExpanded)}
        >
          <View style={styles.printerHeaderLeft}>
            <Ionicons
              name={connectedDeviceName ? 'print' : 'print-outline'}
              size={24}
              color={connectedDeviceName ? '#10b981' : '#64748b'}
            />
            <View>
              <Text style={styles.printerTitle}>Bluetooth Printer</Text>
              <Text style={[styles.printerStatus, connectedDeviceName && styles.printerConnected]}>
                {connectedDeviceName || 'Not connected'}
              </Text>
            </View>
          </View>
          <Ionicons
            name={printerExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color="#64748b"
          />
        </TouchableOpacity>

        {printerExpanded && (
          <View style={styles.printerContent}>
            {connectedDeviceName ? (
              <View style={styles.connectedPrinter}>
                <View style={styles.connectedPrinterInfo}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.connectedPrinterName}>{connectedDeviceName}</Text>
                </View>
                <View style={styles.connectedPrinterActions}>
                  <TouchableOpacity
                    style={[styles.printerActionBtn, styles.testPrintBtn]}
                    onPress={testPrint}
                  >
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                    <Text style={styles.printerActionBtnText}>Test</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.printerActionBtn, styles.disconnectBtn]}
                    onPress={disconnectPrinter}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#fff" />
                    <Text style={styles.printerActionBtnText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.scanBtn, scanning && styles.scanBtnActive]}
                  onPress={scanning ? stopScan : startScan}
                  disabled={connecting}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="bluetooth" size={20} color="#fff" />
                  )}
                  <Text style={styles.scanBtnText}>
                    {scanning ? 'Scanning...' : 'Scan for Printers'}
                  </Text>
                </TouchableOpacity>

                {connecting && (
                  <View style={styles.connectingRow}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.connectingText}>Connecting...</Text>
                  </View>
                )}

                {devices.length > 0 && (
                  <View style={styles.devicesList}>
                    {devices.map((device) => (
                      <TouchableOpacity
                        key={device.id}
                        style={styles.deviceItem}
                        onPress={() => connectToDevice(device)}
                        disabled={connecting}
                      >
                        <Ionicons name="print-outline" size={20} color="#1e293b" />
                        <View style={styles.deviceInfo}>
                          <Text style={styles.deviceName}>{device.name || 'Unknown'}</Text>
                          <Text style={styles.deviceId}>{device.id}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {!scanning && devices.length === 0 && (
                  <Text style={styles.printerHint}>
                    Make sure your printer is turned on and in pairing mode
                  </Text>
                )}
              </>
            )}
          </View>
        )}
      </View>

      {/* Optimize Route Button */}
      {activeOrders.length > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBarButton, styles.routeButton]}
            onPress={openOptimizedRoute}
          >
            <Ionicons name="map" size={20} color="#fff" />
            <Text style={styles.actionBarButtonText}>Optimize Route</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Orders List */}
      <FlatList
        data={activeOrders}
        renderItem={renderOrderCard}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              No {activeTab === 'pickups' ? 'pickups' : 'deliveries'} available
            </Text>
          </View>
        }
      />

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
    paddingHorizontal: 20,
    paddingBottom: 16,
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  tabActive: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1e293b',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#1e293b',
  },
  tabBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeActive: {
    backgroundColor: '#1e293b',
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabBadgeTextActive: {
    color: '#fff',
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  orderId: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  customerInfo: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  customerPhone: {
    fontSize: 14,
    color: '#2563eb',
    marginTop: 4,
  },
  customerAddress: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  orderInfo: {
    flexDirection: 'row',
    padding: 12,
    gap: 20,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#64748b',
  },
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  navigateButton: {
    backgroundColor: '#2563eb',
  },
  callButton: {
    backgroundColor: '#10b981',
  },
  statusButton: {
    backgroundColor: '#10b981',
  },
  storeButton: {
    backgroundColor: '#6366f1',
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
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  actionBarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBarButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  routeButton: {
    backgroundColor: '#2563eb',
  },
  printButton: {
    backgroundColor: '#8b5cf6',
  },
  // Print Tag Button
  printTagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
  },
  printingButton: {
    backgroundColor: '#a78bfa',
  },
  printTagButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Printer Section
  printerSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  printerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  printerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  printerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  printerStatus: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  printerConnected: {
    color: '#10b981',
  },
  printerContent: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    padding: 16,
  },
  connectedPrinter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectedPrinterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedPrinterName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  connectedPrinterActions: {
    flexDirection: 'row',
    gap: 8,
  },
  printerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  printerActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  testPrintBtn: {
    backgroundColor: '#2563eb',
  },
  disconnectBtn: {
    backgroundColor: '#ef4444',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
  },
  scanBtnActive: {
    backgroundColor: '#f59e0b',
  },
  scanBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  connectingText: {
    fontSize: 14,
    color: '#2563eb',
  },
  devicesList: {
    marginTop: 12,
    gap: 8,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  deviceId: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  printerHint: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
  },
});
