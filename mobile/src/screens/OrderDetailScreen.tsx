import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import type { Order } from '../types';

export default function OrderDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadOrder();
  }, []);

  async function loadOrder() {
    try {
      const data = await api.getOrder(route.params.orderId);
      setOrder(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load order');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!order) return;
    setUpdating(true);
    try {
      await api.updateOrderStatus(order._id, newStatus);
      await loadOrder();
      Alert.alert('Success', 'Order status updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  }

  // Status groups matching web app
  const STATUS_GROUPS: Record<string, string[]> = {
    new_order: ['new_order', 'received', 'scheduled_pickup'],
    processing: ['in_washer', 'in_dryer', 'laid_on_cart', 'folding'],
    ready: ['ready_for_pickup', 'ready_for_delivery', 'picked_up'],
  };

  function getStatusColor(status: string) {
    if (STATUS_GROUPS.new_order.includes(status)) return '#3b82f6'; // blue
    if (STATUS_GROUPS.processing.includes(status)) return '#f59e0b'; // amber
    if (STATUS_GROUPS.ready.includes(status)) return '#10b981'; // green
    if (status === 'out_for_delivery') return '#8b5cf6'; // purple
    if (status === 'completed') return '#6b7280'; // gray
    return '#94a3b8';
  }

  function getNextStatus(current: string): { status: string; label: string } | null {
    // Match web app's status progression
    const flow: Record<string, { status: string; label: string }> = {
      // New orders
      new_order: { status: 'received', label: 'Mark Received' },
      scheduled_pickup: { status: 'picked_up', label: 'Mark Picked Up' },
      picked_up: { status: 'received', label: 'Mark at Store' },
      received: { status: 'in_washer', label: 'Start Washing' },
      // Processing
      in_washer: { status: 'in_dryer', label: 'Move to Dryer' },
      in_dryer: { status: 'laid_on_cart', label: 'Move to Cart' },
      laid_on_cart: { status: 'folding', label: 'Start Folding' },
      folding: { status: 'ready_for_pickup', label: 'Mark Ready' },
      // Ready
      ready_for_pickup: { status: 'completed', label: 'Complete Order' },
      ready_for_delivery: { status: 'out_for_delivery', label: 'Out for Delivery' },
      out_for_delivery: { status: 'completed', label: 'Mark Delivered' },
    };
    return flow[current] || null;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!order) return null;

  const nextStatus = getNextStatus(order.status);

  return (
    <ScrollView style={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.orderId}>Order #{order.orderId}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
            <Text style={styles.statusText}>
              {order.status.replace(/_/g, ' ').toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.totalAmount}>${(order.totalAmount || 0).toFixed(2)}</Text>
      </View>

      {/* Customer Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <View style={styles.card}>
          <Text style={styles.customerName}>{order.customerName}</Text>
          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
          >
            <Ionicons name="call" size={20} color="#2563eb" />
            <Text style={styles.contactText}>{order.customerPhone}</Text>
          </TouchableOpacity>
          {order.customer?.address && (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(order.customer!.address)}`)}
            >
              <Ionicons name="location" size={20} color="#2563eb" />
              <Text style={styles.contactText}>{order.customer.address}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Order Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>
              {order.orderType === 'delivery' ? 'Pickup & Delivery' : 'In-Store'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Weight</Text>
            <Text style={styles.detailValue}>{order.weight || 0} lbs</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment</Text>
            <Text style={styles.detailValue}>
              {order.paymentMethod} - {order.paymentStatus}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Created</Text>
            <Text style={styles.detailValue}>
              {new Date(order.dropOffDate).toLocaleString()}
            </Text>
          </View>
          {order.isSameDay && (
            <View style={styles.sameDayBadge}>
              <Ionicons name="flash" size={16} color="#f59e0b" />
              <Text style={styles.sameDayText}>Same Day Service</Text>
            </View>
          )}
        </View>
      </View>

      {/* Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items</Text>
        <View style={styles.card}>
          {order.items?.map((item, index) => (
            <View key={index} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.serviceName}</Text>
              <Text style={styles.itemPrice}>${item.total.toFixed(2)}</Text>
            </View>
          ))}
          {order.extraItems?.map((item, index) => (
            <View key={`extra-${index}`} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name} x{item.quantity}</Text>
              <Text style={styles.itemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${(order.totalAmount || 0).toFixed(2)}</Text>
          </View>
        </View>
      </View>

      {/* Notes */}
      {order.specialInstructions && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Special Instructions</Text>
          <View style={styles.notesCard}>
            <Text style={styles.notesText}>{order.specialInstructions}</Text>
          </View>
        </View>
      )}

      {/* Actions */}
      {nextStatus && (
        <View style={styles.actionSection}>
          <TouchableOpacity
            style={[styles.actionButton, updating && styles.actionButtonDisabled]}
            onPress={() => updateStatus(nextStatus.status)}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.actionButtonText}>{nextStatus.label}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
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
  headerCard: {
    backgroundColor: '#1e293b',
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  contactText: {
    fontSize: 16,
    color: '#2563eb',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  sameDayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  sameDayText: {
    color: '#92400e',
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemName: {
    fontSize: 14,
    color: '#1e293b',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  notesCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
  },
  notesText: {
    fontSize: 14,
    color: '#92400e',
  },
  actionSection: {
    margin: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
  },
  actionButtonDisabled: {
    backgroundColor: '#6ee7b7',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
