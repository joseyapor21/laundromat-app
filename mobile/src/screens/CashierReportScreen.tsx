import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import type { Order, PaymentMethod } from '../types';

const PAYMENT_METHODS: { key: PaymentMethod; label: string; color: string }[] = [
  { key: 'cash', label: 'Cash', color: '#10b981' },
  { key: 'check', label: 'Check', color: '#3b82f6' },
  { key: 'venmo', label: 'Venmo', color: '#8b5cf6' },
  { key: 'zelle', label: 'Zelle', color: '#f59e0b' },
];

export default function CashierReportScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const loadOrders = useCallback(async () => {
    try {
      const allOrders = await api.getOrders();
      setOrders(allOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  // Filter orders by selected date and paid status
  const paidOrdersToday = orders.filter(order => {
    if (!order.isPaid) return false;
    const orderDate = new Date(order.dropOffDate);
    return (
      orderDate.getFullYear() === selectedDate.getFullYear() &&
      orderDate.getMonth() === selectedDate.getMonth() &&
      orderDate.getDate() === selectedDate.getDate()
    );
  });

  // Calculate totals by payment method
  const totalsByMethod = PAYMENT_METHODS.map(method => {
    const methodOrders = paidOrdersToday.filter(o => o.paymentMethod === method.key);
    const total = methodOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    return {
      ...method,
      count: methodOrders.length,
      total,
    };
  });

  const grandTotal = totalsByMethod.reduce((sum, m) => sum + m.total, 0);
  const totalOrderCount = paidOrdersToday.length;

  // Date navigation
  const goToPreviousDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isToday = () => {
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  };

  // Share report
  const handleShare = async () => {
    const report = `
CASHIER REPORT
${formatDate(selectedDate)}

SUMMARY:
${totalsByMethod.map(m => `${m.label}: ${m.count} orders - $${m.total.toFixed(2)}`).join('\n')}

TOTAL: ${totalOrderCount} orders - $${grandTotal.toFixed(2)}

PAID ORDERS:
${paidOrdersToday.map(o => `#${o.orderId} - ${o.customerName} - $${o.totalAmount.toFixed(2)} (${o.paymentMethod})`).join('\n')}
    `.trim();

    try {
      await Share.share({
        message: report,
        title: `Cashier Report - ${formatDate(selectedDate)}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Cashier Report</Text>
        </View>

        {/* Date Selector */}
        <View style={styles.dateSelector}>
          <TouchableOpacity style={styles.dateArrow} onPress={goToPreviousDay}>
            <Ionicons name="chevron-back" size={24} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday}>
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            {!isToday() && (
              <Text style={styles.todayLink}>Tap for today</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateArrow} onPress={goToNextDay}>
            <Ionicons name="chevron-forward" size={24} color="#2563eb" />
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.summarySection}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Revenue</Text>
            <Text style={styles.totalAmount}>${grandTotal.toFixed(2)}</Text>
            <Text style={styles.totalOrders}>{totalOrderCount} paid orders</Text>
          </View>
        </View>

        {/* Payment Method Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Payment Method</Text>
          {totalsByMethod.map(method => (
            <View key={method.key} style={styles.methodCard}>
              <View style={styles.methodInfo}>
                <View style={[styles.methodDot, { backgroundColor: method.color }]} />
                <Text style={styles.methodLabel}>{method.label}</Text>
              </View>
              <View style={styles.methodStats}>
                <Text style={styles.methodCount}>{method.count} orders</Text>
                <Text style={styles.methodTotal}>${method.total.toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Order List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paid Orders ({paidOrdersToday.length})</Text>
          {paidOrdersToday.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No paid orders for this date</Text>
            </View>
          ) : (
            paidOrdersToday.map(order => (
              <View key={order._id} style={styles.orderCard}>
                <View style={styles.orderInfo}>
                  <Text style={styles.orderNumber}>#{order.orderId}</Text>
                  <Text style={styles.orderCustomer}>{order.customerName}</Text>
                </View>
                <View style={styles.orderPayment}>
                  <Text style={styles.orderAmount}>${order.totalAmount.toFixed(2)}</Text>
                  <View style={[
                    styles.paymentBadge,
                    { backgroundColor: PAYMENT_METHODS.find(m => m.key === order.paymentMethod)?.color || '#94a3b8' }
                  ]}>
                    <Text style={styles.paymentBadgeText}>{order.paymentMethod}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Share Button */}
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color="#fff" />
          <Text style={styles.shareButtonText}>Share Report</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#1e293b',
    padding: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  dateArrow: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  todayLink: {
    fontSize: 12,
    color: '#2563eb',
    textAlign: 'center',
    marginTop: 4,
  },
  summarySection: {
    padding: 16,
  },
  totalCard: {
    backgroundColor: '#10b981',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  totalOrders: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  methodCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  methodLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  methodStats: {
    alignItems: 'flex-end',
  },
  methodCount: {
    fontSize: 12,
    color: '#64748b',
  },
  methodTotal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  orderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  orderInfo: {},
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  orderCustomer: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  orderPayment: {
    alignItems: 'flex-end',
  },
  orderAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
