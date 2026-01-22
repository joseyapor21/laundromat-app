import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import type { Order } from '../types';

interface CleaningTask {
  id: string;
  label: string;
  checked: boolean;
}

const DEFAULT_CLEANING_TASKS: CleaningTask[] = [
  { id: 'lints', label: 'Lints cleaned from dryers', checked: false },
  { id: 'trash', label: 'Trash taken out', checked: false },
  { id: 'machines_top', label: 'Top of machines cleaned', checked: false },
  { id: 'floor', label: 'Floor swept', checked: false },
  { id: 'bathroom', label: 'Bathroom cleaned', checked: false },
];

export default function EODReportScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>(DEFAULT_CLEANING_TASKS);
  const [notes, setNotes] = useState('');
  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);

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

  // Filter orders by status - matching web
  const ordersInCart = orders.filter(o => o.status === 'laid_on_cart' || o.status === 'folding');
  const ordersInDryer = orders.filter(o => o.status === 'in_dryer');
  const ordersInWasher = orders.filter(o => o.status === 'in_washer');
  const ordersToWash = orders.filter(o => o.status === 'new_order' || o.status === 'received' || o.status === 'picked_up');

  // Toggle cleaning task
  const toggleTask = (taskId: string) => {
    setCleaningTasks(prev =>
      prev.map(task =>
        task.id === taskId ? { ...task, checked: !task.checked } : task
      )
    );
  };

  // Format pickup time
  const formatPickupTime = (order: Order) => {
    if (!order.estimatedPickupDate) return '';
    const date = new Date(order.estimatedPickupDate);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dayName} ${time}`;
  };

  // Format today's date
  const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Share report
  const handleShare = async () => {
    let report = `EOD Report\n${formatDate()}\n\n`;

    if (ordersInCart.length > 0) {
      report += 'IN CARTS:\n';
      ordersInCart.forEach(order => {
        report += `- ${order.customerName} ${order.weight || 0} lbs ${formatPickupTime(order)}\n`;
      });
      report += '\n';
    }

    if (ordersInDryer.length > 0) {
      report += 'IN DRYERS:\n';
      ordersInDryer.forEach(order => {
        report += `- ${order.customerName} ${order.weight || 0} lbs ${formatPickupTime(order)}\n`;
      });
      report += '\n';
    }

    if (ordersInWasher.length > 0) {
      report += 'IN WASHERS:\n';
      ordersInWasher.forEach(order => {
        report += `- ${order.customerName} ${order.weight || 0} lbs ${formatPickupTime(order)}\n`;
      });
      report += '\n';
    }

    if (ordersToWash.length > 0) {
      report += 'Things To Wash:\n';
      report += 'To be washed tomorrow. Loads are already in front of the machines.\n';
      ordersToWash.forEach(order => {
        report += `- ${order.customerName} ${order.weight || 0} lbs\n`;
      });
      report += '\n';
    }

    report += 'Cleaning Duties:\n';
    cleaningTasks.forEach(task => {
      report += `- ${task.label} ${task.checked ? '✓' : '○'}\n`;
    });

    if (notes) {
      report += `\nNotes:\n${notes}\n`;
    }

    try {
      await Share.share({
        message: report,
        title: 'End of Day Report',
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

  const renderOrderCard = (order: Order, bgColor: string, textColor: string) => (
    <View key={order._id} style={[styles.orderCard, { backgroundColor: '#fff', borderLeftColor: bgColor, borderLeftWidth: 4 }]}>
      <View style={styles.orderCardContent}>
        <Text style={styles.orderCustomerName}>{order.customerName}</Text>
        <Text style={styles.orderWeight}>{order.weight || 0} lbs</Text>
      </View>
      {formatPickupTime(order) ? (
        <Text style={[styles.orderPickupTime, { color: textColor }]}>{formatPickupTime(order)}</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        enableOnAndroid={true}
        extraScrollHeight={20}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>EOD Report</Text>
          <Text style={styles.headerDate}>{formatDate()}</Text>
        </View>

        {/* In Carts Section */}
        <View style={[styles.section, { backgroundColor: '#fef3c7' }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.countBadge, { backgroundColor: '#fbbf24' }]}>
              <Text style={styles.countBadgeText}>{ordersInCart.length}</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: '#92400e' }]}>IN CARTS</Text>
          </View>
          {ordersInCart.length === 0 ? (
            <Text style={[styles.emptyText, { color: '#b45309' }]}>No orders in carts</Text>
          ) : (
            ordersInCart.map(order => renderOrderCard(order, '#fbbf24', '#92400e'))
          )}
        </View>

        {/* In Dryers Section */}
        <View style={[styles.section, { backgroundColor: '#ffedd5' }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.countBadge, { backgroundColor: '#f97316' }]}>
              <Text style={styles.countBadgeText}>{ordersInDryer.length}</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: '#9a3412' }]}>IN DRYERS</Text>
          </View>
          {ordersInDryer.length === 0 ? (
            <Text style={[styles.emptyText, { color: '#c2410c' }]}>No orders in dryers</Text>
          ) : (
            ordersInDryer.map(order => renderOrderCard(order, '#f97316', '#9a3412'))
          )}
        </View>

        {/* In Washers Section */}
        {ordersInWasher.length > 0 && (
          <View style={[styles.section, { backgroundColor: '#cffafe' }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.countBadge, { backgroundColor: '#06b6d4' }]}>
                <Text style={styles.countBadgeText}>{ordersInWasher.length}</Text>
              </View>
              <Text style={[styles.sectionTitle, { color: '#155e75' }]}>IN WASHERS</Text>
            </View>
            {ordersInWasher.map(order => renderOrderCard(order, '#06b6d4', '#155e75'))}
          </View>
        )}

        {/* Things to Wash Section */}
        <View style={[styles.section, { backgroundColor: '#dbeafe' }]}>
          <View style={styles.sectionHeader}>
            <View style={[styles.countBadge, { backgroundColor: '#3b82f6' }]}>
              <Text style={styles.countBadgeText}>{ordersToWash.length}</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: '#1e40af' }]}>Things To Wash</Text>
          </View>
          <Text style={[styles.sectionSubtitle, { color: '#1d4ed8' }]}>
            To be washed tomorrow. Loads are already in front of the machines.
          </Text>
          {ordersToWash.length === 0 ? (
            <Text style={[styles.emptyText, { color: '#2563eb' }]}>No pending orders</Text>
          ) : (
            ordersToWash.map(order => (
              <View key={order._id} style={[styles.orderCard, { backgroundColor: '#fff', borderLeftColor: '#3b82f6', borderLeftWidth: 4 }]}>
                <View style={styles.orderCardContent}>
                  <Text style={styles.orderCustomerName}>{order.customerName}</Text>
                  <Text style={styles.orderWeight}>{order.weight || 0} lbs</Text>
                </View>
                <View style={[styles.statusBadge, {
                  backgroundColor: order.status === 'new_order' ? '#dbeafe' :
                    order.status === 'received' ? '#e0e7ff' : '#f3e8ff'
                }]}>
                  <Text style={[styles.statusBadgeText, {
                    color: order.status === 'new_order' ? '#1e40af' :
                      order.status === 'received' ? '#3730a3' : '#6b21a8'
                  }]}>
                    {order.status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Cleaning Duties Section */}
        <View style={[styles.section, { backgroundColor: '#dcfce7' }]}>
          <Text style={[styles.sectionTitle, { color: '#166534', marginBottom: 12 }]}>Cleaning Duties</Text>
          {cleaningTasks.map(task => (
            <TouchableOpacity
              key={task.id}
              style={styles.checklistItem}
              onPress={() => toggleTask(task.id)}
            >
              <View style={[styles.checkbox, task.checked && styles.checkboxChecked]}>
                {task.checked && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <Text style={[styles.checklistLabel, task.checked && styles.checklistLabelChecked]}>
                {task.label}
              </Text>
              {task.checked && <Text style={styles.checkMark}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>

        {/* Notes Section */}
        <View style={styles.notesSection}>
          <Text style={styles.notesSectionTitle}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any additional notes for tomorrow..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Share Button */}
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color="#fff" />
          <Text style={styles.shareButtonText}>Share Report</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
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
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerDate: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  countBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
  },
  orderCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  orderCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderCustomerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  orderWeight: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 12,
  },
  orderPickupTime: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  checklistLabel: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
  },
  checklistLabelChecked: {
    color: '#10b981',
    textDecorationLine: 'line-through',
  },
  checkMark: {
    fontSize: 18,
    color: '#10b981',
    marginLeft: 8,
  },
  notesSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  notesSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  notesInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#1e293b',
    minHeight: 100,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
