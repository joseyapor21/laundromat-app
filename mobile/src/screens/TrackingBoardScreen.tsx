import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { Order } from '../types';

function formatTime(date: Date | string | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  h = h % 12 || 12;
  return `${h}:${m}`;
}

function getInitials(name: string | undefined): string {
  if (!name) return '';
  if (name.length <= 3 && !name.includes(' ')) return name;
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getFirstName(name: string | undefined): string {
  if (!name) return '';
  return name.split(' ')[0];
}

interface TrackingRow {
  orderId: number;
  _id: string;
  customerName: string;
  ticketNumber: string;
  status: string;
  // NAME - who put it to wash
  washerAssignedBy: string;
  // WASHER #
  washerMachine: string;
  // TIME (wash)
  washerTime: string;
  // TRANSFER (who transferred)
  transferredBy: string;
  // TIME (transfer)
  transferTime: string;
  // DRYER #
  dryerMachine: string;
  // W - washer check
  washerCheckedBy: string;
  // D - dryer check
  dryerCheckedBy: string;
  // LAYOUT
  layoutBy: string;
  // FOLDER
  folderBy: string;
  // Done
  done: boolean;
  // Date for grouping
  createdDate: string;
}

function buildRow(order: Order): TrackingRow {
  const washers = (order.machineAssignments || []).filter(m => m.machineType === 'washer');
  const dryers = (order.machineAssignments || []).filter(m => m.machineType === 'dryer');

  const firstWasher = washers[0];
  const firstDryer = dryers[0];

  const doneStatuses = ['ready_for_pickup', 'ready_for_delivery', 'delivered', 'picked_up'];

  return {
    orderId: order.orderId,
    _id: order._id,
    customerName: order.customerName || '',
    ticketNumber: order.ticketNumber || String(order.orderId),
    status: order.status,
    washerAssignedBy: getFirstName(firstWasher?.assignedBy) || firstWasher?.assignedByInitials || '',
    washerMachine: washers.map(w => w.machineName).join(',') || '',
    washerTime: formatTime(firstWasher?.assignedAt),
    transferredBy: getFirstName(order.transferredBy as any) || order.transferredByInitials || '',
    transferTime: formatTime(order.transferredAt),
    dryerMachine: dryers.map(d => d.machineName).join(',') || '',
    washerCheckedBy: getFirstName(firstWasher?.checkedBy) || firstWasher?.checkedByInitials || '',
    dryerCheckedBy: getFirstName(firstDryer?.checkedBy) || firstDryer?.checkedByInitials || '',
    layoutBy: getFirstName(order.layeringCheckedBy as any) || order.layeringCheckedByInitials || '',
    folderBy: getFirstName(order.foldedBy as any) || order.foldedByInitials || '',
    done: doneStatuses.includes(order.status),
    createdDate: (() => {
      const raw = firstWasher?.assignedAt || order.dropOffDate || order.createdAt;
      if (!raw) return 'No Date';
      const d = new Date(raw);
      if (isNaN(d.getTime())) return 'No Date';
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}-${dd}-${yyyy}`;
    })(),
  };
}

// Base column proportions (will scale to fill screen width)
const BASE = {
  name: 55,
  customer: 80,
  ticket: 55,
  washer: 35,
  time: 48,
  transfer: 55,
  dryer: 30,
  check: 48,
  layout: 50,
  folder: 50,
  done: 35,
};
// total of all base widths: name + customer + ticket + washer + time*2 + transfer + dryer + check*2 + layout + folder + done
const BASE_TOTAL = BASE.name + BASE.customer + BASE.ticket + BASE.washer + BASE.time * 2 + BASE.transfer + BASE.dryer + BASE.check * 2 + BASE.layout + BASE.folder + BASE.done;

function getColWidths(screenWidth: number) {
  // Use the larger of screen width or base total so columns always fill the screen
  const w = Math.max(screenWidth, BASE_TOTAL);
  const s = w / BASE_TOTAL;
  return {
    name: Math.floor(BASE.name * s),
    customer: Math.floor(BASE.customer * s),
    ticket: Math.floor(BASE.ticket * s),
    washer: Math.floor(BASE.washer * s),
    time: Math.floor(BASE.time * s),
    transfer: Math.floor(BASE.transfer * s),
    dryer: Math.floor(BASE.dryer * s),
    check: Math.floor(BASE.check * s),
    layout: Math.floor(BASE.layout * s),
    folder: Math.floor(BASE.folder * s),
    done: Math.floor(BASE.done * s),
  };
}

const YELLOW = '#fde047';
const HEADER_BG = '#1e3a5f';
const BORDER = '#94a3b8';

export default function TrackingBoardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: screenWidth } = useWindowDimensions();
  const C = getColWidths(screenWidth - insets.left - insets.right);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.getOrders();
      const activeStatuses = [
        'received', 'in_washer', 'transferred', 'transfer_checked',
        'in_dryer', 'on_cart', 'laid_on_cart', 'folding', 'folded',
        'ready_for_pickup', 'ready_for_delivery',
      ];
      const filtered = data
        .filter((o: Order) => activeStatuses.includes(o.status))
        .sort((a: Order, b: Order) => {
          // Sort by washer assigned date (newest first), then by order ID
          const wA = (a.machineAssignments || []).find(m => m.machineType === 'washer');
          const wB = (b.machineAssignments || []).find(m => m.machineType === 'washer');
          const dA = (wA?.assignedAt || a.dropOffDate || a.createdAt) ? new Date(wA?.assignedAt || a.dropOffDate || a.createdAt).getTime() : 0;
          const dB = (wB?.assignedAt || b.dropOffDate || b.createdAt) ? new Date(wB?.assignedAt || b.dropOffDate || b.createdAt).getTime() : 0;
          const dateA = isNaN(dA) ? 0 : new Date(dA).setHours(0,0,0,0);
          const dateB = isNaN(dB) ? 0 : new Date(dB).setHours(0,0,0,0);
          if (dateA !== dateB) return dateB - dateA;
          return (a.orderId || 0) - (b.orderId || 0);
        });
      setOrders(filtered);
    } catch (e) {
      console.error('Failed to load orders for tracking board', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  useAutoRefresh(loadOrders, 15000);

  const rows = orders.map(buildRow);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <Text style={[styles.hCell, { width: C.name }]}>NAME</Text>
      <Text style={[styles.hCell, { width: C.customer }]}>CUSTOMER</Text>
      <Text style={[styles.hCell, { width: C.ticket }]}>TICKET{'\n'}#</Text>
      <Text style={[styles.hCell, { width: C.washer }]}>W{'\n'}#</Text>
      <Text style={[styles.hCell, { width: C.time }]}>TIME</Text>
      <Text style={[styles.hCell, { width: C.transfer }]}>TRANSFER</Text>
      <Text style={[styles.hCell, { width: C.time }]}>TIME</Text>
      <Text style={[styles.hCell, { width: C.dryer }]}>D{'\n'}#</Text>
      <Text style={[styles.hCell, { width: C.check }]}>W</Text>
      <Text style={[styles.hCell, { width: C.check }]}>D</Text>
      <Text style={[styles.hCell, { width: C.layout }]}>LAYOUT</Text>
      <Text style={[styles.hCell, { width: C.folder }]}>FOLDER</Text>
      <Text style={[styles.hCell, { width: C.done, backgroundColor: YELLOW }]}>
        <Text style={{ color: '#000' }}>Done</Text>
      </Text>
    </View>
  );

  const renderRow = (row: TrackingRow, index: number) => {
    const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';

    return (
      <TouchableOpacity
        key={row._id}
        style={[styles.dRow, { backgroundColor: bg }]}
        onPress={() => navigation.navigate('OrderDetail', { orderId: row._id })}
        activeOpacity={0.7}
      >
        <Text style={[styles.dCell, { width: C.name }]} numberOfLines={1}>{row.washerAssignedBy}</Text>
        <Text style={[styles.dCell, { width: C.customer }]} numberOfLines={1}>{row.customerName}</Text>
        <Text style={[styles.dCell, styles.center, { width: C.ticket }]}>{row.ticketNumber}</Text>
        <Text style={[styles.dCell, styles.center, { width: C.washer, fontWeight: '700' }]}>{row.washerMachine}</Text>
        <Text style={[styles.dCell, styles.center, { width: C.time, fontSize: 10 }]}>{row.washerTime}</Text>
        <Text style={[styles.dCell, { width: C.transfer }]} numberOfLines={1}>{row.transferredBy}</Text>
        <Text style={[styles.dCell, styles.center, { width: C.time, fontSize: 10 }]}>{row.transferTime}</Text>
        <Text style={[styles.dCell, styles.center, { width: C.dryer, fontWeight: '700' }]}>{row.dryerMachine}</Text>
        <Text style={[styles.dCell, { width: C.check }]} numberOfLines={1}>{row.washerCheckedBy}</Text>
        <Text style={[styles.dCell, { width: C.check }]} numberOfLines={1}>{row.dryerCheckedBy}</Text>
        <Text style={[styles.dCell, { width: C.layout }]} numberOfLines={1}>{row.layoutBy}</Text>
        <Text style={[styles.dCell, { width: C.folder }]} numberOfLines={1}>{row.folderBy}</Text>
        <View style={[styles.doneCell, { width: C.done, backgroundColor: row.done ? YELLOW : 'transparent' }]}>
          {row.done && <Ionicons name="checkmark" size={16} color="#000" />}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1e40af" />
        </TouchableOpacity>
        <Text style={styles.title}>Tracking Board</Text>
        <Text style={styles.countBadge}>{rows.length}</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#1e40af" />
        </TouchableOpacity>
      </View>

      {/* Table */}
      <ScrollView
        horizontal
        style={styles.tableContainer}
        showsHorizontalScrollIndicator={true}
      >
        <View>
          {renderHeader()}
          <ScrollView
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={true}
          >
            {rows.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="clipboard-outline" size={48} color="#94a3b8" />
                <Text style={styles.emptyText}>No active orders</Text>
              </View>
            ) : (
              rows.map((row, i) => {
                const showDateHeader = i === 0 || row.createdDate !== rows[i - 1].createdDate;
                const tableWidth = C.name + C.customer + C.ticket + C.washer + C.time * 2 + C.transfer + C.dryer + C.check * 2 + C.layout + C.folder + C.done;
                return (
                  <React.Fragment key={row._id}>
                    {showDateHeader && (
                      <View style={[styles.dateRow, { width: tableWidth }]}>
                        <Text style={styles.dateText}>{row.createdDate}</Text>
                      </View>
                    )}
                    {renderRow(row, i)}
                  </React.Fragment>
                );
              })
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#2563eb',
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 8,
  },
  refreshBtn: {
    padding: 4,
  },
  tableContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: HEADER_BG,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  hCell: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 8,
    paddingHorizontal: 3,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.3)',
  },
  dRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    minHeight: 34,
  },
  dCell: {
    fontSize: 11,
    color: '#1e293b',
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  center: {
    textAlign: 'center',
  },
  doneCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 5,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  dateRow: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e3a5f',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
  },
});
