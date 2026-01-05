import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import type { User, Customer, Settings, ExtraItem, Machine } from '../types';

type Tab = 'users' | 'customers' | 'settings' | 'machines';

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);

  // Search
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [usersData, customersData, settingsData, machinesData] = await Promise.all([
        api.getUsers().catch(() => []),
        api.getCustomers(),
        api.getSettings(),
        api.getMachines().catch(() => []),
      ]);
      setUsers(usersData);
      setCustomers(customersData);
      setSettings(settingsData);
      setMachines(machinesData);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  async function addCredit(customer: Customer) {
    Alert.prompt(
      'Add Credit',
      `Add credit to ${customer.name}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (amount) => {
            const value = parseFloat(amount || '0');
            if (value <= 0) {
              Alert.alert('Error', 'Please enter a valid amount');
              return;
            }
            try {
              await api.addCustomerCredit(customer._id, value, 'Credit added via mobile app');
              Alert.alert('Success', `$${value.toFixed(2)} credit added`);
              loadData();
            } catch (error) {
              Alert.alert('Error', 'Failed to add credit');
            }
          },
        },
      ],
      'plain-text',
      '',
      'decimal-pad'
    );
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phoneNumber.includes(customerSearch)
  );

  const tabs = [
    { key: 'users', label: 'Users', icon: 'people' },
    { key: 'customers', label: 'Customers', icon: 'person' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
    { key: 'machines', label: 'Machines', icon: 'hardware-chip' },
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
        <Text style={styles.headerTitle}>Admin Panel</Text>
      </View>

      {/* Tabs */}
      <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
        <View style={styles.tabs}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key as Tab)}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={activeTab === tab.key ? '#fff' : '#64748b'}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Content */}
      {activeTab === 'users' && (
        <View style={{ flex: 1 }}>
          <FlatList
            data={users}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: user }) => (
              <View style={styles.card}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
                  <Text style={styles.cardSubtitle}>{user.email}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: user.role === 'admin' ? '#8b5cf6' : '#3b82f6' }]}>
                  <Text style={styles.badgeText}>{user.role}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            }
          />
        </View>
      )}

      {activeTab === 'customers' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search customers..."
              placeholderTextColor="#94a3b8"
            />
          </View>
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: customer }) => (
              <View style={styles.card}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{customer.name}</Text>
                  <Text style={styles.cardSubtitle}>{customer.phoneNumber}</Text>
                  <View style={styles.creditRow}>
                    <Text style={styles.creditLabel}>Credit:</Text>
                    <Text style={[styles.creditValue, { color: (customer.credit || 0) > 0 ? '#10b981' : '#94a3b8' }]}>
                      ${(customer.credit || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.addCreditButton}
                  onPress={() => addCredit(customer)}
                >
                  <Ionicons name="add-circle" size={24} color="#10b981" />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No customers found</Text>
              </View>
            }
          />
        </View>
      )}

      {activeTab === 'settings' && settings && (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Pricing</Text>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Minimum Weight</Text>
              <Text style={styles.settingsValue}>{settings.minimumWeight} lbs</Text>
            </View>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Minimum Price</Text>
              <Text style={styles.settingsValue}>${settings.minimumPrice}</Text>
            </View>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Price Per Pound</Text>
              <Text style={styles.settingsValue}>${settings.pricePerPound}</Text>
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Same Day Service</Text>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Minimum Charge</Text>
              <Text style={styles.settingsValue}>${settings.sameDayMinimumCharge}</Text>
            </View>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Extra Percentage</Text>
              <Text style={styles.settingsValue}>{settings.sameDayExtraPercentage}%</Text>
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Printer</Text>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>IP Address</Text>
              <Text style={styles.settingsValue}>{settings.printerIP || 'Not set'}</Text>
            </View>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Port</Text>
              <Text style={styles.settingsValue}>{settings.printerPort}</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {activeTab === 'machines' && (
        <View style={{ flex: 1 }}>
          <FlatList
            data={machines}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: machine }) => (
              <View style={styles.card}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{machine.name}</Text>
                  <Text style={styles.cardSubtitle}>QR: {machine.qrCode}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={[
                    styles.badge,
                    { backgroundColor: machine.type === 'washer' ? '#06b6d4' : '#f97316' }
                  ]}>
                    <Text style={styles.badgeText}>{machine.type}</Text>
                  </View>
                  <View style={[
                    styles.badge,
                    {
                      backgroundColor: machine.status === 'available' ? '#10b981' :
                        machine.status === 'in_use' ? '#3b82f6' : '#ef4444',
                      marginTop: 4,
                    }
                  ]}>
                    <Text style={styles.badgeText}>{machine.status.replace('_', ' ')}</Text>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No machines found</Text>
              </View>
            }
          />
        </View>
      )}
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
  tabsContainer: {
    backgroundColor: '#fff',
    maxHeight: 60,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  creditLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  creditValue: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  addCreditButton: {
    padding: 8,
  },
  settingsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingsLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  settingsValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
  },
});
