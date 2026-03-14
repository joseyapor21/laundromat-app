import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

type StockStatus = 'full' | 'good' | 'half' | 'low' | 'out';

interface InventoryItem {
  _id: string;
  name: string;
  quantity: number;
  status: StockStatus;
  lowStockThreshold: number;
  unit: string;
  category: string;
  notes?: string;
  needsOrder: boolean;
  orderQuantity?: number;
  lastUpdatedBy?: string;
  lastUpdated?: string;
}

const STATUS_CONFIG: Record<StockStatus, { label: string; color: string; bg: string; icon: string }> = {
  full:  { label: 'Full',  color: '#166534', bg: '#dcfce7', icon: 'checkmark-circle' },
  good:  { label: 'Good',  color: '#1e40af', bg: '#dbeafe', icon: 'thumbs-up' },
  half:  { label: 'Half',  color: '#854d0e', bg: '#fef9c3', icon: 'remove-circle' },
  low:   { label: 'Low',   color: '#9a3412', bg: '#ffedd5', icon: 'warning' },
  out:   { label: 'Out',   color: '#991b1b', bg: '#fee2e2', icon: 'close-circle' },
};

const STATUSES: StockStatus[] = ['full', 'good', 'half', 'low', 'out'];

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const canEdit = isAdmin || user?.role === 'cashier' || user?.isInventoryManager === true;

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '', quantity: '0', status: 'good' as StockStatus,
    lowStockThreshold: '2', unit: 'items', category: 'General',
    notes: '', needsOrder: false, orderQuantity: '0',
  });

  async function loadInventory() {
    try {
      const data = await api.getInventory();
      setItems(data.items || []);
      setCategories(data.categories || []);
      setLowStockCount(data.lowStockCount || 0);
    } catch (e) {
      console.error('Failed to load inventory:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { loadInventory(); }, []));

  const filteredItems = useMemo(() => items.filter(item => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'needs_order' && !item.needsOrder) return false;
      else if (statusFilter !== 'needs_order' && item.status !== statusFilter) return false;
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      return item.name.toLowerCase().includes(s) || item.category?.toLowerCase().includes(s);
    }
    return true;
  }), [items, categoryFilter, statusFilter, search]);

  async function handleQuickStatus(item: InventoryItem, status: StockStatus) {
    try {
      await api.updateInventoryItem(item._id, {
        status,
        needsOrder: (status === 'low' || status === 'out') ? true : item.needsOrder,
      });
      await loadInventory();
    } catch (e) {
      Alert.alert('Error', 'Failed to update status');
    }
  }

  async function handleSaveEdit() {
    if (!editingItem) return;
    setSaving(true);
    try {
      await api.updateInventoryItem(editingItem._id, editingItem);
      setEditingItem(null);
      await loadInventory();
    } catch (e) {
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddItem() {
    if (!newItem.name.trim()) return Alert.alert('Error', 'Item name is required');
    setSaving(true);
    try {
      await api.createInventoryItem({
        ...newItem,
        quantity: parseFloat(newItem.quantity) || 0,
        lowStockThreshold: parseInt(newItem.lowStockThreshold) || 2,
        orderQuantity: parseInt(newItem.orderQuantity) || null,
        notes: newItem.notes || null,
      });
      setShowAddModal(false);
      setNewItem({ name: '', quantity: '0', status: 'good', lowStockThreshold: '2', unit: 'items', category: 'General', notes: '', needsOrder: false, orderQuantity: '0' });
      await loadInventory();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete Item', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteInventoryItem(id);
            await loadInventory();
          } catch (e) {
            Alert.alert('Error', 'Failed to delete item');
          }
        },
      },
    ]);
  }

  const renderItem = useCallback(({ item }: { item: InventoryItem }) => {
    const st = STATUS_CONFIG[item.status];
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemCategory}>{item.category}</Text>
            {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.itemQty}>{item.quantity} <Text style={styles.itemUnit}>{item.unit}</Text></Text>
            {item.needsOrder && (
              <View style={styles.orderBadge}>
                <Ionicons name="cart-outline" size={11} color="#92400e" />
                <Text style={styles.orderBadgeText}>Order</Text>
              </View>
            )}
          </View>
        </View>

        {/* Status selector row */}
        <View style={styles.statusRow}>
          {STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s];
            const active = item.status === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.statusBtn, active && { backgroundColor: cfg.bg }]}
                onPress={() => canEdit && handleQuickStatus(item, s)}
                disabled={!canEdit}
              >
                <Text style={[styles.statusBtnText, active && { color: cfg.color, fontWeight: '700' }]}>
                  {cfg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {canEdit && (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditingItem({ ...item })}>
              <Ionicons name="pencil-outline" size={14} color="#2563eb" />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            {(isAdmin || user?.isInventoryManager) && (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item._id)}>
                <Ionicons name="trash-outline" size={14} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }, [canEdit, isAdmin, user?.isInventoryManager, handleQuickStatus, setEditingItem, handleDelete]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Inventory</Text>
          {lowStockCount > 0 && (
            <Text style={styles.headerAlert}>⚠️ {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} need attention</Text>
          )}
        </View>
        {canEdit && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search items..."
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {['all', ...categories].map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, categoryFilter === cat && styles.filterChipActive]}
            onPress={() => setCategoryFilter(cat)}
          >
            <Text style={[styles.filterChipText, categoryFilter === cat && styles.filterChipTextActive]}>
              {cat === 'all' ? 'All' : cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {[
          { key: 'all', label: 'All Status' },
          { key: 'full', label: '🟢 Full' },
          { key: 'good', label: '🔵 Good' },
          { key: 'half', label: '🟡 Half' },
          { key: 'low', label: '🟠 Low' },
          { key: 'out', label: '🔴 Out' },
          { key: 'needs_order', label: '🛒 Needs Order' },
        ].map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadInventory(); }} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="cube-outline" size={56} color="#cbd5e1" />
              <Text style={styles.emptyText}>No inventory items found</Text>
            </View>
          }
        />
      )}

      {/* Edit Modal */}
      {editingItem && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingItem(null)}>
          <View style={[styles.modalContainer, { paddingTop: insets.top + 8 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Item</Text>
              <TouchableOpacity onPress={() => setEditingItem(null)}>
                <Ionicons name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={editingItem.name}
                onChangeText={v => setEditingItem(p => p ? { ...p, name: v } : p)}
              />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Quantity</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={String(editingItem.quantity)}
                    onChangeText={v => setEditingItem(p => p ? { ...p, quantity: parseFloat(v) || 0 } : p)}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={editingItem.unit}
                    onChangeText={v => setEditingItem(p => p ? { ...p, unit: v } : p)}
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Category</Text>
              <TextInput
                style={styles.fieldInput}
                value={editingItem.category}
                onChangeText={v => setEditingItem(p => p ? { ...p, category: v } : p)}
              />
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.statusPicker}>
                {STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const active = editingItem.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.statusPickerBtn, active && { backgroundColor: cfg.bg, borderColor: cfg.color }]}
                      onPress={() => setEditingItem(p => p ? { ...p, status: s } : p)}
                    >
                      <Text style={[styles.statusPickerText, active && { color: cfg.color, fontWeight: '700' }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Low Stock At</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={String(editingItem.lowStockThreshold)}
                    onChangeText={v => setEditingItem(p => p ? { ...p, lowStockThreshold: parseInt(v) || 0 } : p)}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Order Qty</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={String(editingItem.orderQuantity || 0)}
                    onChangeText={v => setEditingItem(p => p ? { ...p, orderQuantity: parseInt(v) || 0 } : p)}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={styles.fieldInput}
                value={editingItem.notes || ''}
                onChangeText={v => setEditingItem(p => p ? { ...p, notes: v } : p)}
                placeholder="Optional notes"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={styles.needsOrderToggle}
                onPress={() => setEditingItem(p => p ? { ...p, needsOrder: !p.needsOrder } : p)}
              >
                <View style={[styles.checkbox, editingItem.needsOrder && styles.checkboxActive]}>
                  {editingItem.needsOrder && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.checkboxLabel}>Mark as needs order</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingItem(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSaveEdit} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddModal(false)}>
          <View style={[styles.modalContainer, { paddingTop: insets.top + 8 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Item</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.fieldInput}
                value={newItem.name}
                onChangeText={v => setNewItem(p => ({ ...p, name: v }))}
                placeholder="e.g. Tide Detergent"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Quantity</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={newItem.quantity}
                    onChangeText={v => setNewItem(p => ({ ...p, quantity: v }))}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Unit</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={newItem.unit}
                    onChangeText={v => setNewItem(p => ({ ...p, unit: v }))}
                    placeholder="items, bottles..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Category</Text>
              <TextInput
                style={styles.fieldInput}
                value={newItem.category}
                onChangeText={v => setNewItem(p => ({ ...p, category: v }))}
                placeholder="e.g. Detergents, Supplies"
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.statusPicker}>
                {STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const active = newItem.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.statusPickerBtn, active && { backgroundColor: cfg.bg, borderColor: cfg.color }]}
                      onPress={() => setNewItem(p => ({ ...p, status: s }))}
                    >
                      <Text style={[styles.statusPickerText, active && { color: cfg.color, fontWeight: '700' }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={styles.fieldInput}
                value={newItem.notes}
                onChangeText={v => setNewItem(p => ({ ...p, notes: v }))}
                placeholder="Optional"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={styles.needsOrderToggle}
                onPress={() => setNewItem(p => ({ ...p, needsOrder: !p.needsOrder }))}
              >
                <View style={[styles.checkbox, newItem.needsOrder && styles.checkboxActive]}>
                  {newItem.needsOrder && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.checkboxLabel}>Mark as needs order</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleAddItem} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Adding...' : 'Add Item'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  headerAlert: { fontSize: 12, color: '#d97706', marginTop: 2 },
  addBtn: {
    backgroundColor: '#2563eb', borderRadius: 20, padding: 8,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 10,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b' },
  filterScroll: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filterChipText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, gap: 10, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { fontSize: 15, color: '#94a3b8', textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardLeft: { flex: 1, gap: 2 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  itemCategory: { fontSize: 12, color: '#64748b' },
  itemNotes: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },
  itemQty: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  itemUnit: { fontSize: 12, fontWeight: '500', color: '#64748b' },
  orderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#fef3c7', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10,
  },
  orderBadgeText: { fontSize: 10, fontWeight: '600', color: '#92400e' },
  statusRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  statusBtn: {
    flex: 1, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  statusBtnText: { fontSize: 11, color: '#64748b' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#eff6ff', borderRadius: 8 },
  editBtnText: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#fef2f2', borderRadius: 8 },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  modalBody: { padding: 20, gap: 4, paddingBottom: 32 },
  modalFooter: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 4, marginTop: 10 },
  fieldInput: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, color: '#1e293b', backgroundColor: '#fff',
  },
  row2: { flexDirection: 'row', gap: 10 },
  statusPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statusPickerBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  statusPickerText: { fontSize: 13, color: '#64748b' },
  needsOrderToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 2,
    borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkboxLabel: { fontSize: 14, color: '#1e293b', fontWeight: '500' },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
