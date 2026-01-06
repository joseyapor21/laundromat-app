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
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { useBluetoothPrinter } from '../services/bluetoothPrinter';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
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
  const [printing, setPrinting] = useState(false);
  const [labelQuantity, setLabelQuantity] = useState('1');
  const [labelModalVisible, setLabelModalVisible] = useState(false);

  // Bluetooth printer hook
  const {
    isConnected: bluetoothConnected,
    isConnecting: bluetoothConnecting,
    error: bluetoothError,
    deviceName,
    connect: connectBluetooth,
    disconnect: disconnectBluetooth,
    printLabel: bluetoothPrintLabel,
  } = useBluetoothPrinter();

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
  }, [loadOrders]);

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

  function callCustomer(phone: string) {
    Linking.openURL(`tel:${phone}`);
  }

  function openLabelModal(order: Order) {
    setSelectedOrder(order);
    setLabelQuantity('1');
    setLabelModalVisible(true);
  }

  async function handleBluetoothPrint() {
    if (!selectedOrder) return;

    const quantity = parseInt(labelQuantity);
    if (isNaN(quantity) || quantity < 1 || quantity > 10) {
      Alert.alert('Error', 'Please enter a valid quantity (1-10)');
      return;
    }

    setPrinting(true);
    try {
      const orderData = {
        orderId: selectedOrder.orderId?.toString() || selectedOrder._id.slice(-6),
        customerName: selectedOrder.customerName,
        customerPhone: selectedOrder.customerPhone,
        address: selectedOrder.customer?.address || '',
        weight: selectedOrder.weight,
        notes: selectedOrder.specialInstructions,
        _id: selectedOrder._id,
      };

      await bluetoothPrintLabel(orderData, quantity);
      Alert.alert('Success', `${quantity} label(s) printed for ${selectedOrder.customerName}`);
      setLabelModalVisible(false);

      // Auto-update status to picked_up if new order
      if (selectedOrder.status === 'new_order' || selectedOrder.status === 'scheduled_pickup') {
        await updateStatus(selectedOrder._id, 'picked_up');
      }
    } catch (error) {
      Alert.alert('Print Error', error instanceof Error ? error.message : 'Failed to print');
    } finally {
      setPrinting(false);
    }
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

          <TouchableOpacity
            style={[styles.actionButton, styles.callButton]}
            onPress={() => callCustomer(order.customerPhone)}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Call</Text>
          </TouchableOpacity>

          {/* Print Label Button - Pickup only */}
          {isPickup && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.printLabelButton,
                !bluetoothConnected && styles.buttonDisabled
              ]}
              onPress={() => openLabelModal(order)}
              disabled={!bluetoothConnected}
            >
              <Ionicons name="pricetag" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Label</Text>
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

        {/* Bluetooth Status */}
        <View style={[styles.bluetoothStatus, bluetoothConnected && styles.bluetoothConnected]}>
          <View style={styles.bluetoothLeft}>
            <View style={[styles.bluetoothDot, bluetoothConnected && styles.bluetoothDotConnected]} />
            <Text style={[styles.bluetoothText, bluetoothConnected && styles.bluetoothTextConnected]}>
              {bluetoothConnected ? `Printer: ${deviceName || 'Connected'}` : 'Printer Disconnected'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.bluetoothButton, bluetoothConnected && styles.bluetoothButtonDisconnect]}
            onPress={bluetoothConnected ? disconnectBluetooth : connectBluetooth}
            disabled={bluetoothConnecting}
          >
            {bluetoothConnecting ? (
              <ActivityIndicator size="small" color={bluetoothConnected ? '#64748b' : '#fff'} />
            ) : (
              <Text style={[styles.bluetoothButtonText, bluetoothConnected && styles.bluetoothButtonTextDisconnect]}>
                {bluetoothConnected ? 'Disconnect' : 'Connect'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {bluetoothError && (
          <Text style={styles.bluetoothError}>{bluetoothError}</Text>
        )}
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

      {/* Label Quantity Modal */}
      <Modal
        visible={labelModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLabelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.labelModalContent}>
            <View style={styles.labelModalHeader}>
              <Ionicons name="pricetags" size={32} color="#8b5cf6" />
              <Text style={styles.labelModalTitle}>Print Labels</Text>
            </View>

            {selectedOrder && (
              <Text style={styles.labelModalSubtitle}>
                Order #{selectedOrder.orderId} - {selectedOrder.customerName}
              </Text>
            )}

            <Text style={styles.labelQuantityLabel}>How many labels do you need?</Text>
            <TextInput
              style={styles.labelQuantityInput}
              value={labelQuantity}
              onChangeText={setLabelQuantity}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="1"
              placeholderTextColor="#94a3b8"
            />

            <View style={styles.labelModalButtons}>
              <TouchableOpacity
                style={styles.labelCancelButton}
                onPress={() => setLabelModalVisible(false)}
              >
                <Text style={styles.labelCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.labelPrintButton, printing && styles.buttonDisabled]}
                onPress={handleBluetoothPrint}
                disabled={printing}
              >
                {printing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="print" size={20} color="#fff" />
                    <Text style={styles.labelPrintButtonText}>Print Labels</Text>
                  </>
                )}
              </TouchableOpacity>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // Bluetooth status styles
  bluetoothStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bluetoothConnected: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  bluetoothLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bluetoothDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#94a3b8',
  },
  bluetoothDotConnected: {
    backgroundColor: '#10b981',
  },
  bluetoothText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  bluetoothTextConnected: {
    color: '#059669',
  },
  bluetoothButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  bluetoothButtonDisconnect: {
    backgroundColor: '#e2e8f0',
  },
  bluetoothButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  bluetoothButtonTextDisconnect: {
    color: '#64748b',
  },
  bluetoothError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 8,
  },
  // Print label button
  printLabelButton: {
    backgroundColor: '#8b5cf6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Label modal styles
  labelModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  labelModalHeader: {
    alignItems: 'center',
    marginBottom: 8,
  },
  labelModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 8,
  },
  labelModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
  },
  labelQuantityLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 12,
  },
  labelQuantityInput: {
    width: '100%',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    color: '#1e293b',
    marginBottom: 20,
  },
  labelModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  labelCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  labelCancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  labelPrintButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
  },
  labelPrintButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
