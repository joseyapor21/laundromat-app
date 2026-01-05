import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import type { Order } from '../types';

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: '1', label: 'Clean front counters', checked: false },
  { id: '2', label: 'Wipe down machines', checked: false },
  { id: '3', label: 'Sweep floors', checked: false },
  { id: '4', label: 'Mop floors', checked: false },
  { id: '5', label: 'Empty trash bins', checked: false },
  { id: '6', label: 'Organize folding tables', checked: false },
  { id: '7', label: 'Check detergent levels', checked: false },
  { id: '8', label: 'Lock back door', checked: false },
  { id: '9', label: 'Turn off lights', checked: false },
  { id: '10', label: 'Set alarm', checked: false },
];

export default function EODReportScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [notes, setNotes] = useState('');

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

  // Filter orders by status
  const ordersInCart = orders.filter(o => o.status === 'laid_on_cart');
  const ordersInDryer = orders.filter(o => o.status === 'in_dryer');
  const ordersInWasher = orders.filter(o => o.status === 'in_washer');
  const ordersFolding = orders.filter(o => o.status === 'folding');
  const ordersReady = orders.filter(o => o.status === 'ready_for_pickup' || o.status === 'ready_for_delivery');

  // Toggle checklist item
  const toggleChecklistItem = (id: string) => {
    setChecklist(prev =>
      prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  // Calculate checklist completion
  const completedCount = checklist.filter(item => item.checked).length;
  const totalCount = checklist.length;
  const completionPercentage = Math.round((completedCount / totalCount) * 100);

  // Share report
  const handleShare = async () => {
    const report = `
END OF DAY REPORT
${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

ORDER STATUS SUMMARY:
- In Cart: ${ordersInCart.length} orders
- In Dryer: ${ordersInDryer.length} orders
- In Washer: ${ordersInWasher.length} orders
- Folding: ${ordersFolding.length} orders
- Ready for Pickup: ${ordersReady.length} orders

CLEANING CHECKLIST (${completedCount}/${totalCount}):
${checklist.map(item => `${item.checked ? '[x]' : '[ ]'} ${item.label}`).join('\n')}

NOTES FOR NEXT SHIFT:
${notes || 'None'}
    `.trim();

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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>End of Day Report</Text>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Order Status Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Status Summary</Text>
          <View style={styles.statusGrid}>
            <View style={[styles.statusCard, { backgroundColor: '#fef3c7' }]}>
              <Text style={styles.statusCount}>{ordersInCart.length}</Text>
              <Text style={styles.statusLabel}>In Cart</Text>
            </View>
            <View style={[styles.statusCard, { backgroundColor: '#ffedd5' }]}>
              <Text style={styles.statusCount}>{ordersInDryer.length}</Text>
              <Text style={styles.statusLabel}>In Dryer</Text>
            </View>
            <View style={[styles.statusCard, { backgroundColor: '#cffafe' }]}>
              <Text style={styles.statusCount}>{ordersInWasher.length}</Text>
              <Text style={styles.statusLabel}>In Washer</Text>
            </View>
            <View style={[styles.statusCard, { backgroundColor: '#fce7f3' }]}>
              <Text style={styles.statusCount}>{ordersFolding.length}</Text>
              <Text style={styles.statusLabel}>Folding</Text>
            </View>
          </View>
          <View style={styles.readyCard}>
            <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            <Text style={styles.readyLabel}>Ready for Pickup/Delivery</Text>
            <Text style={styles.readyCount}>{ordersReady.length}</Text>
          </View>
        </View>

        {/* Orders requiring attention */}
        {ordersInWasher.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Things to Wash (Next Shift)</Text>
            {ordersInWasher.map(order => (
              <View key={order._id} style={styles.orderItem}>
                <Text style={styles.orderNumber}>#{order.orderId}</Text>
                <Text style={styles.orderCustomer}>{order.customerName}</Text>
                <Text style={styles.orderWeight}>{order.weight || 0} lbs</Text>
              </View>
            ))}
          </View>
        )}

        {/* Cleaning Checklist */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Cleaning Checklist</Text>
            <View style={styles.progressBadge}>
              <Text style={styles.progressText}>{completionPercentage}%</Text>
            </View>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completionPercentage}%` }]} />
          </View>
          <View style={styles.checklistCard}>
            {checklist.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.checklistItem}
                onPress={() => toggleChecklistItem(item.id)}
              >
                <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                  {item.checked && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={[styles.checklistLabel, item.checked && styles.checklistLabelChecked]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notes for Next Shift */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes for Next Shift</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any important information for the next shift..."
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
  headerDate: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusCard: {
    width: '48%',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statusCount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  statusLabel: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  readyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  readyLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#166534',
  },
  readyCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#166534',
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    width: 70,
  },
  orderCustomer: {
    flex: 1,
    fontSize: 14,
    color: '#64748b',
  },
  orderWeight: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  progressBadge: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  checklistCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  checklistLabel: {
    fontSize: 15,
    color: '#1e293b',
  },
  checklistLabelChecked: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
    minHeight: 120,
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
