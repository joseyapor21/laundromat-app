import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { Order, PaymentMethod } from '../types';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: 'Cash', icon: 'cash-outline' },
  { value: 'venmo', label: 'Venmo', icon: 'phone-portrait-outline' },
  { value: 'zelle', label: 'Zelle', icon: 'swap-horizontal-outline' },
  { value: 'check', label: 'Check', icon: 'document-text-outline' },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  venmo: 'Venmo',
  zelle: 'Zelle',
  check: 'Check',
  credit: 'Credit',
  credit_card: 'Credit Card',
  pending: 'Pending',
};

export default function DeliveryPaymentsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<'unpaid' | 'verify'>('unpaid');
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [verifyOrders, setVerifyOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<{ [orderId: string]: PaymentMethod }>({});

  const isAdminOrCashier =
    user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'cashier';

  async function loadOrders() {
    try {
      const data = await api.getOrders();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const deliveriesToday = (data || []).filter((o: Order) => {
        if (o.orderType !== 'delivery') return false;
        if (o.status === 'archived' || o.status === 'cancelled') return false;
        const deliveryDate = o.deliverySchedule ? new Date(o.deliverySchedule) : null;
        if (!deliveryDate) return false;
        return deliveryDate >= today && deliveryDate < tomorrow;
      });

      // Tab 1: unpaid orders (driver marks payment)
      setUnpaidOrders(deliveriesToday.filter((o: Order) => !o.isPaid));

      // Tab 2: paid but not yet completed (cashier verifies)
      setVerifyOrders(deliveriesToday.filter((o: Order) => o.isPaid && o.status !== 'completed'));
    } catch (e) {
      console.error('Failed to load delivery payments:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => {
    loadOrders();
  }, []));

  async function handleMarkPaid(order: Order) {
    const method = selectedMethod[order._id] || 'cash';
    Alert.alert(
      'Confirm Payment',
      `Mark order #${order.orderId} as paid?\n\nCustomer: ${order.customerName}\nTotal: $${(order.totalAmount || 0).toFixed(2)}\nMethod: ${method.charAt(0).toUpperCase() + method.slice(1)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Paid',
          onPress: async () => {
            setActionId(order._id);
            try {
              await api.updateOrder(order._id, {
                isPaid: true,
                paymentMethod: method,
                paymentStatus: 'paid',
                amountPaid: order.totalAmount,
                paidAt: new Date().toISOString(),
              });
              await loadOrders();
            } catch (e) {
              Alert.alert('Error', 'Failed to mark order as paid');
            } finally {
              setActionId(null);
            }
          },
        },
      ]
    );
  }

  async function handleVerifyAndComplete(order: Order) {
    Alert.alert(
      'Verify Payment',
      `Confirm payment received for order #${order.orderId}?\n\nCustomer: ${order.customerName}\nTotal: $${(order.totalAmount || 0).toFixed(2)}\nMethod: ${PAYMENT_METHOD_LABELS[order.paymentMethod || ''] || order.paymentMethod || 'N/A'}\n\nThis will mark the order as completed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify & Complete',
          onPress: async () => {
            setActionId(order._id);
            try {
              await api.updateOrderStatus(order._id, 'completed');
              await loadOrders();
            } catch (e) {
              Alert.alert('Error', 'Failed to complete order');
            } finally {
              setActionId(null);
            }
          },
        },
      ]
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1e293b" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Delivery Payments</Text>
          <Text style={styles.headerSub}>{today}</Text>
        </View>
        <TouchableOpacity onPress={() => { setRefreshing(true); loadOrders(); }} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#2563eb" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'unpaid' && styles.tabActive]}
          onPress={() => setTab('unpaid')}
        >
          <Text style={[styles.tabText, tab === 'unpaid' && styles.tabTextActive]}>
            Collect Payment
          </Text>
          {unpaidOrders.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unpaidOrders.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        {isAdminOrCashier && (
          <TouchableOpacity
            style={[styles.tab, tab === 'verify' && styles.tabActive]}
            onPress={() => setTab('verify')}
          >
            <Text style={[styles.tabText, tab === 'verify' && styles.tabTextActive]}>
              Verify Payment
            </Text>
            {verifyOrders.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#f59e0b' }]}>
                <Text style={styles.tabBadgeText}>{verifyOrders.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : tab === 'unpaid' ? (
        /* ── COLLECT PAYMENT TAB ── */
        unpaidOrders.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="checkmark-circle" size={64} color="#10b981" />
            <Text style={styles.emptyTitle}>All Collected!</Text>
            <Text style={styles.emptyText}>No unpaid deliveries scheduled for today.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} />}
          >
            <View style={styles.summaryBanner}>
              <Ionicons name="alert-circle" size={20} color="#d97706" />
              <Text style={styles.summaryText}>
                {unpaidOrders.length} order{unpaidOrders.length !== 1 ? 's' : ''} pending payment —{' '}
                <Text style={{ fontWeight: '800' }}>
                  ${unpaidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2)} total
                </Text>
              </Text>
            </View>

            {unpaidOrders.map(order => {
              const method = selectedMethod[order._id] || 'cash';
              const isActing = actionId === order._id;
              return (
                <View key={order._id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={styles.orderId}>Order #{order.orderId}</Text>
                      <View style={[styles.badge, { backgroundColor: '#fef3c7' }]}>
                        <Ionicons name="bicycle-outline" size={12} color="#d97706" />
                        <Text style={[styles.badgeText, { color: '#d97706' }]}>
                          {order.status === 'out_for_delivery' ? 'Out for Delivery' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.orderTotal}>${(order.totalAmount || 0).toFixed(2)}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.customerRow}
                    onPress={() => navigation.navigate('OrderDetail' as never, { orderId: order._id } as never)}
                  >
                    <Ionicons name="person-outline" size={16} color="#64748b" />
                    <Text style={styles.customerName}>{order.customerName}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
                  </TouchableOpacity>

                  {order.customerPhone && (
                    <View style={styles.infoRow}>
                      <Ionicons name="call-outline" size={14} color="#64748b" />
                      <Text style={styles.infoText}>{order.customerPhone}</Text>
                    </View>
                  )}

                  {order.bags && order.bags.length > 0 && (
                    <View style={styles.infoRow}>
                      <Ionicons name="bag-handle-outline" size={14} color="#64748b" />
                      <Text style={styles.infoText}>
                        {order.bags.length} bag{order.bags.length !== 1 ? 's' : ''} · {order.weight || 0} lbs
                      </Text>
                    </View>
                  )}

                  <Text style={styles.methodLabel}>Payment Method</Text>
                  <View style={styles.methodRow}>
                    {PAYMENT_METHODS.map(pm => (
                      <TouchableOpacity
                        key={pm.value}
                        style={[styles.methodBtn, method === pm.value && styles.methodBtnActive]}
                        onPress={() => setSelectedMethod(prev => ({ ...prev, [order._id]: pm.value }))}
                      >
                        <Ionicons
                          name={pm.icon as any}
                          size={14}
                          color={method === pm.value ? '#fff' : '#64748b'}
                        />
                        <Text style={[styles.methodBtnText, method === pm.value && styles.methodBtnTextActive]}>
                          {pm.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.paidBtn, isActing && styles.btnDisabled]}
                    onPress={() => handleMarkPaid(order)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="cash-outline" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Collected · ${(order.totalAmount || 0).toFixed(2)}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )
      ) : (
        /* ── VERIFY PAYMENT TAB ── */
        verifyOrders.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="shield-checkmark" size={64} color="#10b981" />
            <Text style={styles.emptyTitle}>Nothing to Verify</Text>
            <Text style={styles.emptyText}>No payments awaiting verification.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} />}
          >
            <View style={[styles.summaryBanner, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
              <Ionicons name="time-outline" size={20} color="#d97706" />
              <Text style={styles.summaryText}>
                {verifyOrders.length} order{verifyOrders.length !== 1 ? 's' : ''} awaiting cashier verification
              </Text>
            </View>

            {verifyOrders.map(order => {
              const isActing = actionId === order._id;
              return (
                <View key={order._id} style={[styles.card, styles.verifyCard]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={styles.orderId}>Order #{order.orderId}</Text>
                      <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
                        <Ionicons name="cash-outline" size={12} color="#16a34a" />
                        <Text style={[styles.badgeText, { color: '#16a34a' }]}>Marked as Paid</Text>
                      </View>
                    </View>
                    <Text style={styles.orderTotal}>${(order.totalAmount || 0).toFixed(2)}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.customerRow}
                    onPress={() => navigation.navigate('OrderDetail' as never, { orderId: order._id } as never)}
                  >
                    <Ionicons name="person-outline" size={16} color="#64748b" />
                    <Text style={styles.customerName}>{order.customerName}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
                  </TouchableOpacity>

                  {order.customerPhone && (
                    <View style={styles.infoRow}>
                      <Ionicons name="call-outline" size={14} color="#64748b" />
                      <Text style={styles.infoText}>{order.customerPhone}</Text>
                    </View>
                  )}

                  {/* Payment info */}
                  <View style={styles.paymentInfoBox}>
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>Method</Text>
                      <Text style={styles.paymentInfoValue}>
                        {PAYMENT_METHOD_LABELS[order.paymentMethod || ''] || order.paymentMethod || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.paymentInfoRow}>
                      <Text style={styles.paymentInfoLabel}>Amount</Text>
                      <Text style={[styles.paymentInfoValue, { color: '#16a34a', fontWeight: '700' }]}>
                        ${(order.amountPaid || order.totalAmount || 0).toFixed(2)}
                      </Text>
                    </View>
                    {order.paidBy && (
                      <View style={styles.paymentInfoRow}>
                        <Text style={styles.paymentInfoLabel}>Collected by</Text>
                        <Text style={styles.paymentInfoValue}>{order.paidBy}</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.verifyBtn, isActing && styles.btnDisabled]}
                    onPress={() => handleVerifyAndComplete(order)}
                    disabled={isActing}
                  >
                    {isActing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Verify & Complete</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 12,
  },
  backBtn: { padding: 4 },
  refreshBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#2563eb' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#2563eb' },
  tabBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  list: { padding: 16, gap: 14 },
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 4,
  },
  summaryText: { fontSize: 14, color: '#92400e', flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  verifyCard: { borderColor: '#bbf7d0' },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  orderTotal: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  customerName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1e293b' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  infoText: { fontSize: 13, color: '#64748b' },
  methodLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 12, marginBottom: 8 },
  methodRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  methodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  methodBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  methodBtnText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  methodBtnTextActive: { color: '#fff' },
  paymentInfoBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginTop: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  paymentInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentInfoLabel: { fontSize: 13, color: '#64748b' },
  paymentInfoValue: { fontSize: 13, color: '#1e293b', fontWeight: '600' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  paidBtn: { backgroundColor: '#10b981' },
  verifyBtn: { backgroundColor: '#2563eb' },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
