import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Device } from 'react-native-ble-plx';
import { api } from '../services/api';
import { bluetoothPrinter } from '../services/BluetoothPrinter';
import type { User, Customer, Settings, ExtraItem, Machine, MachineType, MachineStatus, UserRole, ActivityLog } from '../types';

type Tab = 'users' | 'customers' | 'extras' | 'settings' | 'machines' | 'printers' | 'activity';

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Data
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);

  // Printer state
  const [printerScanning, setPrinterScanning] = useState(false);
  const [printerConnecting, setPrinterConnecting] = useState(false);
  const [printerDevices, setPrinterDevices] = useState<Device[]>([]);
  const [connectedPrinterName, setConnectedPrinterName] = useState<string | null>(null);

  // Search
  const [customerSearch, setCustomerSearch] = useState('');

  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [showExtraItemModal, setShowExtraItemModal] = useState(false);
  const [showMachineModal, setShowMachineModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Edit state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingExtraItem, setEditingExtraItem] = useState<ExtraItem | null>(null);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  // Form state for modals
  const [userForm, setUserForm] = useState({ email: '', firstName: '', lastName: '', role: 'employee' as UserRole, password: '' });
  const [extraItemForm, setExtraItemForm] = useState({ name: '', description: '', price: '', isActive: true, perWeightUnit: '' });
  const [machineForm, setMachineForm] = useState({ name: '', type: 'washer' as MachineType, qrCode: '', status: 'available' as MachineStatus });
  const [settingsForm, setSettingsForm] = useState({
    minimumWeight: '',
    minimumPrice: '',
    pricePerPound: '',
    sameDayMinimumCharge: '',
    sameDayExtraCentsPerPound: '',
    storeAddress: '',
    storeLatitude: '',
    storeLongitude: '',
    thermalPrinterIp: '',
    thermalPrinterPort: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [usersData, customersData, extraItemsData, settingsData, machinesData, activityData] = await Promise.all([
        api.getUsers().catch(() => []),
        api.getCustomers(),
        api.getExtraItems().catch(() => []),
        api.getSettings(),
        api.getMachines().catch(() => []),
        api.getActivityLogs({ limit: 50 }).catch(() => ({ logs: [], total: 0 })),
      ]);
      setUsers(usersData);
      setCustomers(customersData);
      setExtraItems(extraItemsData);
      setSettings(settingsData);
      setMachines(machinesData);
      setActivityLogs(activityData.logs);
      setActivityTotal(activityData.total);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    checkPrinterConnection();
  }, [loadData]);

  // Printer functions
  async function checkPrinterConnection() {
    const name = bluetoothPrinter.getConnectedDeviceName();
    setConnectedPrinterName(name);

    if (!name) {
      const reconnected = await bluetoothPrinter.reconnectSavedPrinter();
      if (reconnected) {
        setConnectedPrinterName(bluetoothPrinter.getConnectedDeviceName());
      }
    }
  }

  async function startPrinterScan() {
    setPrinterScanning(true);
    setPrinterDevices([]);

    await bluetoothPrinter.startScan((foundDevices) => {
      setPrinterDevices(foundDevices);
    });

    setTimeout(() => {
      setPrinterScanning(false);
    }, 10000);
  }

  function stopPrinterScan() {
    bluetoothPrinter.stopScan();
    setPrinterScanning(false);
  }

  async function connectToPrinter(device: Device) {
    setPrinterConnecting(true);
    stopPrinterScan();

    const success = await bluetoothPrinter.connect(device);

    if (success) {
      setConnectedPrinterName(device.name || 'Unknown');
      Alert.alert('Connected', `Successfully connected to ${device.name}`);
    } else {
      Alert.alert('Connection Failed', 'Could not connect to the printer. Please try again.');
    }

    setPrinterConnecting(false);
  }

  async function disconnectPrinter() {
    await bluetoothPrinter.disconnect();
    setConnectedPrinterName(null);
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

  async function testPosPrint() {
    try {
      const testContent =
        '\x1B\x40' + // Initialize
        '\x1B\x61\x01' + // Center
        '\x1D\x21\x11' + // Double size
        'TEST PRINT\n' +
        '\x1D\x21\x00' + // Normal size
        '================================\n' +
        'Laundromat App\n' +
        'POS Printer Test\n' +
        '================================\n' +
        '\n\n\n' +
        '\x1D\x56\x00'; // Cut

      const result = await api.printReceipt(testContent);
      if (result.success) {
        Alert.alert('Success', 'Test print sent to POS printer');
      } else {
        Alert.alert('Error', result.error || 'Failed to print');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send test print');
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Customer actions
  const handleCreateCustomer = () => {
    navigation.navigate('CreateCustomer');
  };

  const handleEditCustomer = (customer: Customer) => {
    navigation.navigate('EditCustomer', { customerId: customer._id });
  };

  // User actions
  const openUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        password: '',
      });
    } else {
      setEditingUser(null);
      setUserForm({ email: '', firstName: '', lastName: '', role: 'employee', password: '' });
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.email || !userForm.firstName || !userForm.lastName) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Update user - Note: You may need to implement this endpoint
        Alert.alert('Info', 'User update functionality requires backend support');
      } else {
        // Create/invite user - Note: You may need to implement this endpoint
        Alert.alert('Info', 'User creation functionality requires backend support');
      }
      setShowUserModal(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  // Extra Item actions
  const openExtraItemModal = (item?: ExtraItem) => {
    if (item) {
      setEditingExtraItem(item);
      setExtraItemForm({
        name: item.name,
        description: item.description,
        price: item.price.toString(),
        isActive: item.isActive,
        perWeightUnit: item.perWeightUnit ? item.perWeightUnit.toString() : '',
      });
    } else {
      setEditingExtraItem(null);
      setExtraItemForm({ name: '', description: '', price: '', isActive: true, perWeightUnit: '' });
    }
    setShowExtraItemModal(true);
  };

  const handleSaveExtraItem = async () => {
    if (!extraItemForm.name || !extraItemForm.price) {
      Alert.alert('Error', 'Please fill in name and price');
      return;
    }

    setSaving(true);
    try {
      const perWeightUnit = extraItemForm.perWeightUnit ? parseFloat(extraItemForm.perWeightUnit) : null;

      if (editingExtraItem) {
        await api.updateExtraItem(editingExtraItem._id, {
          name: extraItemForm.name,
          description: extraItemForm.description,
          price: parseFloat(extraItemForm.price),
          isActive: extraItemForm.isActive,
          perWeightUnit: perWeightUnit,
        });
        Alert.alert('Success', 'Extra item updated');
      } else {
        await api.createExtraItem({
          name: extraItemForm.name,
          description: extraItemForm.description,
          price: parseFloat(extraItemForm.price),
          isActive: extraItemForm.isActive,
          perWeightUnit: perWeightUnit,
        });
        Alert.alert('Success', 'Extra item created');
      }
      setShowExtraItemModal(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to save extra item');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExtraItem = (item: ExtraItem) => {
    Alert.alert('Delete Extra Item', `Delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteExtraItem(item._id);
            Alert.alert('Success', 'Extra item deleted');
            loadData();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete extra item');
          }
        },
      },
    ]);
  };

  const handleToggleExtraItem = async (item: ExtraItem) => {
    try {
      await api.updateExtraItem(item._id, { isActive: !item.isActive });
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to update extra item');
    }
  };

  // Machine actions
  const openMachineModal = (machine?: Machine) => {
    if (machine) {
      setEditingMachine(machine);
      setMachineForm({
        name: machine.name,
        type: machine.type,
        qrCode: machine.qrCode,
        status: machine.status,
      });
    } else {
      setEditingMachine(null);
      setMachineForm({ name: '', type: 'washer', qrCode: '', status: 'available' });
    }
    setShowMachineModal(true);
  };

  const handleSaveMachine = async () => {
    if (!machineForm.name || !machineForm.qrCode) {
      Alert.alert('Error', 'Please fill in name and QR code');
      return;
    }

    setSaving(true);
    try {
      if (editingMachine) {
        await api.updateMachine(editingMachine._id, machineForm);
        Alert.alert('Success', 'Machine updated');
      } else {
        // Note: You may need to add createMachine to the API
        Alert.alert('Info', 'Machine creation requires backend support');
      }
      setShowMachineModal(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to save machine');
    } finally {
      setSaving(false);
    }
  };

  // Settings actions
  const openSettingsModal = () => {
    if (settings) {
      setSettingsForm({
        minimumWeight: (settings.minimumWeight || 0).toString(),
        minimumPrice: (settings.minimumPrice || 0).toString(),
        pricePerPound: (settings.pricePerPound || 1.25).toString(),
        sameDayMinimumCharge: (settings.sameDayMinimumCharge || 5).toString(),
        sameDayExtraCentsPerPound: (settings.sameDayExtraCentsPerPound || 0.33).toString(),
        storeAddress: settings.storeAddress || '',
        storeLatitude: (settings.storeLatitude || 40.7128).toString(),
        storeLongitude: (settings.storeLongitude || -74.0060).toString(),
        thermalPrinterIp: settings.thermalPrinterIp || '',
        thermalPrinterPort: (settings.thermalPrinterPort || 9100).toString(),
      });
    }
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.updateSettings({
        minimumWeight: parseFloat(settingsForm.minimumWeight) || 0,
        minimumPrice: parseFloat(settingsForm.minimumPrice) || 0,
        pricePerPound: parseFloat(settingsForm.pricePerPound) || 0,
        sameDayMinimumCharge: parseFloat(settingsForm.sameDayMinimumCharge) || 0,
        sameDayExtraCentsPerPound: parseFloat(settingsForm.sameDayExtraCentsPerPound) || 0,
        storeAddress: settingsForm.storeAddress,
        storeLatitude: parseFloat(settingsForm.storeLatitude) || 40.7128,
        storeLongitude: parseFloat(settingsForm.storeLongitude) || -74.0060,
        thermalPrinterIp: settingsForm.thermalPrinterIp,
        thermalPrinterPort: parseInt(settingsForm.thermalPrinterPort) || 9100,
      });
      Alert.alert('Success', 'Settings updated');
      setShowSettingsModal(false);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phoneNumber.includes(customerSearch)
  );

  // Activity helpers
  const getActionColor = (action: string): string => {
    switch (action) {
      case 'create_order': return '#10b981';
      case 'status_change': return '#3b82f6';
      case 'login': return '#8b5cf6';
      case 'logout': return '#6b7280';
      case 'release_machine': return '#f97316';
      case 'assign_machine': return '#06b6d4';
      case 'payment': return '#10b981';
      default: return '#64748b';
    }
  };

  const getActionIcon = (action: string): string => {
    switch (action) {
      case 'create_order': return 'add-circle';
      case 'status_change': return 'swap-horizontal';
      case 'login': return 'log-in';
      case 'logout': return 'log-out';
      case 'release_machine': return 'exit';
      case 'assign_machine': return 'enter';
      case 'payment': return 'card';
      default: return 'ellipse';
    }
  };

  const formatAction = (action: string): string => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatTimestamp = (timestamp: Date | string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const tabs = [
    { key: 'users', label: 'Users', icon: 'people' },
    { key: 'customers', label: 'Customers', icon: 'person' },
    { key: 'extras', label: 'Extras', icon: 'pricetags' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
    { key: 'machines', label: 'Machines', icon: 'hardware-chip' },
    { key: 'printers', label: 'Printers', icon: 'print' },
    { key: 'activity', label: 'Activity', icon: 'time' },
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
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

      {/* Users Tab */}
      {activeTab === 'users' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionHeader}>
            <Text style={styles.countText}>{users.length} users</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => openUserModal()}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add User</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={users}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: user }) => (
              <TouchableOpacity style={styles.card} onPress={() => openUserModal(user)}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{user.firstName} {user.lastName}</Text>
                  <Text style={styles.cardSubtitle}>{user.email}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: user.role === 'admin' || user.role === 'super_admin' ? '#8b5cf6' : '#3b82f6' }]}>
                  <Text style={styles.badgeText}>{user.role}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Customers Tab */}
      {activeTab === 'customers' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionHeader}>
            <Text style={styles.countText}>{customers.length} customers</Text>
            <TouchableOpacity style={styles.addButton} onPress={handleCreateCustomer}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Customer</Text>
            </TouchableOpacity>
          </View>
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
              <TouchableOpacity style={styles.card} onPress={() => handleEditCustomer(customer)}>
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
                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No customers found</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Extra Items Tab */}
      {activeTab === 'extras' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionHeader}>
            <Text style={styles.countText}>{extraItems.length} items</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => openExtraItemModal()}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Item</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={extraItems}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item }) => {
              const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
              return (
                <View style={[styles.card, !item.isActive && styles.cardInactive]}>
                  <TouchableOpacity style={styles.cardContent} onPress={() => openExtraItemModal(item)}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.cardTitle}>{item.name}</Text>
                      {isWeightBased && (
                        <View style={styles.weightBadge}>
                          <Ionicons name="scale-outline" size={12} color="#7c3aed" />
                          <Text style={styles.weightBadgeText}>By Weight</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardSubtitle}>{item.description}</Text>
                    <Text style={styles.priceText}>
                      ${item.price.toFixed(2)}
                      {isWeightBased && (
                        <Text style={styles.perWeightText}> per {item.perWeightUnit} lbs</Text>
                      )}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.cardActions}>
                    <Switch
                      value={item.isActive}
                      onValueChange={() => handleToggleExtraItem(item)}
                      trackColor={{ false: '#e2e8f0', true: '#86efac' }}
                      thumbColor={item.isActive ? '#10b981' : '#fff'}
                    />
                    <TouchableOpacity onPress={() => handleDeleteExtraItem(item)}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No extra items</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && settings && (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <TouchableOpacity style={styles.editSettingsButton} onPress={openSettingsModal}>
            <Ionicons name="pencil" size={18} color="#fff" />
            <Text style={styles.editSettingsText}>Edit Settings</Text>
          </TouchableOpacity>

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
              <Text style={styles.settingsLabel}>Extra Per Pound</Text>
              <Text style={styles.settingsValue}>${settings.sameDayExtraCentsPerPound}/lb</Text>
            </View>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Minimum Charge</Text>
              <Text style={styles.settingsValue}>${settings.sameDayMinimumCharge}</Text>
            </View>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Store Location</Text>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Address</Text>
              <Text style={styles.settingsValue}>{settings.storeAddress || 'Not set'}</Text>
            </View>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Latitude</Text>
              <Text style={styles.settingsValue}>{settings.storeLatitude || '40.7128'}</Text>
            </View>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Longitude</Text>
              <Text style={styles.settingsValue}>{settings.storeLongitude || '-74.0060'}</Text>
            </View>
          </View>

        </ScrollView>
      )}

      {/* Printers Tab */}
      {activeTab === 'printers' && (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Bluetooth Label Printer (Bipman) */}
          <View style={styles.settingsCard}>
            <View style={styles.printerHeaderRow}>
              <View style={styles.printerHeaderLeft}>
                <Ionicons
                  name={connectedPrinterName ? 'print' : 'print-outline'}
                  size={28}
                  color={connectedPrinterName ? '#10b981' : '#64748b'}
                />
                <View>
                  <Text style={styles.settingsTitle}>Bluetooth Label Printer</Text>
                  <Text style={styles.printerSubtitle}>Bipman - For order tags/labels</Text>
                </View>
              </View>
            </View>

            {connectedPrinterName ? (
              <View style={styles.connectedPrinterSection}>
                <View style={styles.connectedPrinterInfo}>
                  <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  <Text style={styles.connectedPrinterName}>{connectedPrinterName}</Text>
                </View>
                <View style={styles.printerActionButtons}>
                  <TouchableOpacity style={styles.testPrintBtn} onPress={testPrint}>
                    <Ionicons name="document-text-outline" size={18} color="#fff" />
                    <Text style={styles.printerBtnText}>Test Print</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.disconnectBtn} onPress={disconnectPrinter}>
                    <Ionicons name="close-circle-outline" size={18} color="#fff" />
                    <Text style={styles.printerBtnText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.disconnectedPrinterSection}>
                <TouchableOpacity
                  style={[styles.scanButton, printerScanning && styles.scanButtonActive]}
                  onPress={printerScanning ? stopPrinterScan : startPrinterScan}
                  disabled={printerConnecting}
                >
                  {printerScanning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="bluetooth" size={20} color="#fff" />
                  )}
                  <Text style={styles.scanButtonText}>
                    {printerScanning ? 'Scanning...' : 'Scan for Printers'}
                  </Text>
                </TouchableOpacity>

                {printerConnecting && (
                  <View style={styles.connectingRow}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.connectingText}>Connecting...</Text>
                  </View>
                )}

                {printerDevices.length > 0 && (
                  <View style={styles.deviceList}>
                    <Text style={styles.deviceListTitle}>Found Devices:</Text>
                    {printerDevices.map((device) => (
                      <TouchableOpacity
                        key={device.id}
                        style={styles.deviceItem}
                        onPress={() => connectToPrinter(device)}
                        disabled={printerConnecting}
                      >
                        <Ionicons name="print-outline" size={22} color="#1e293b" />
                        <View style={styles.deviceInfo}>
                          <Text style={styles.deviceName}>{device.name || 'Unknown'}</Text>
                          <Text style={styles.deviceId}>{device.id}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {!printerScanning && printerDevices.length === 0 && (
                  <View style={styles.printerHintBox}>
                    <Ionicons name="information-circle-outline" size={20} color="#64748b" />
                    <Text style={styles.printerHintText}>
                      Make sure your Bipman printer is turned on and in pairing mode. Tap "Scan for Printers" to find nearby devices.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* WiFi POS Thermal Printer */}
          <View style={styles.settingsCard}>
            <View style={styles.printerHeaderRow}>
              <View style={styles.printerHeaderLeft}>
                <Ionicons name="wifi" size={28} color="#3b82f6" />
                <View>
                  <Text style={styles.settingsTitle}>WiFi POS Printer</Text>
                  <Text style={styles.printerSubtitle}>Thermal receipt printer</Text>
                </View>
              </View>
            </View>

            {/* Current Settings Display */}
            {settings?.thermalPrinterIp ? (
              <View style={styles.connectedPrinterSection}>
                <View style={styles.connectedPrinterInfo}>
                  <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  <Text style={styles.connectedPrinterName}>
                    {settings.thermalPrinterIp}:{settings.thermalPrinterPort || 9100}
                  </Text>
                </View>
                <View style={styles.printerActionButtons}>
                  <TouchableOpacity style={styles.testPrintBtn} onPress={testPosPrint}>
                    <Ionicons name="document-text-outline" size={18} color="#fff" />
                    <Text style={styles.printerBtnText}>Test Print</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editPrinterBtn} onPress={openSettingsModal}>
                    <Ionicons name="pencil" size={18} color="#fff" />
                    <Text style={styles.printerBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.disconnectedPrinterSection}>
                <View style={styles.printerHintBox}>
                  <Ionicons name="information-circle-outline" size={20} color="#64748b" />
                  <Text style={styles.printerHintText}>
                    No POS printer configured. Tap below to add your thermal printer IP address.
                  </Text>
                </View>
                <TouchableOpacity style={[styles.scanButton, { marginTop: 12 }]} onPress={openSettingsModal}>
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.scanButtonText}>Configure POS Printer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Machines Tab */}
      {activeTab === 'machines' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionHeader}>
            <Text style={styles.countText}>{machines.length} machines</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => openMachineModal()}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Machine</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={machines}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: machine }) => (
              <TouchableOpacity style={styles.card} onPress={() => openMachineModal(machine)}>
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
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No machines found</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionHeader}>
            <Text style={styles.countText}>{activityTotal} activities</Text>
          </View>
          <FlatList
            data={activityLogs}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: log }) => (
              <View style={styles.activityCard}>
                <View style={styles.activityHeader}>
                  <View style={[styles.activityIcon, { backgroundColor: getActionColor(log.action) }]}>
                    <Ionicons name={getActionIcon(log.action)} size={16} color="#fff" />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityAction}>{formatAction(log.action)}</Text>
                    <Text style={styles.activityUser}>{log.userName}</Text>
                  </View>
                  <Text style={styles.activityTime}>{formatTimestamp(log.timestamp)}</Text>
                </View>
                <Text style={styles.activityDetails}>{log.details}</Text>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No activity logs</Text>
              </View>
            }
          />
        </View>
      )}

      {/* User Modal */}
      <Modal visible={showUserModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingUser ? 'Edit User' : 'Add User'}
              </Text>
              <TouchableOpacity onPress={() => setShowUserModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={userForm.email}
                  onChangeText={(text) => setUserForm({ ...userForm, email: text })}
                  placeholder="Email"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={userForm.firstName}
                    onChangeText={(text) => setUserForm({ ...userForm, firstName: text })}
                    placeholder="First name"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Last Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={userForm.lastName}
                    onChangeText={(text) => setUserForm({ ...userForm, lastName: text })}
                    placeholder="Last name"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Role</Text>
                <View style={styles.roleOptions}>
                  {['employee', 'driver', 'admin'].map(role => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.roleOption, userForm.role === role && styles.roleOptionActive]}
                      onPress={() => setUserForm({ ...userForm, role: role as UserRole })}
                    >
                      <Text style={[styles.roleOptionText, userForm.role === role && styles.roleOptionTextActive]}>
                        {role}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {!editingUser && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Temporary Password</Text>
                  <TextInput
                    style={styles.input}
                    value={userForm.password}
                    onChangeText={(text) => setUserForm({ ...userForm, password: text })}
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry
                  />
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowUserModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveUser}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Extra Item Modal */}
      <Modal visible={showExtraItemModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingExtraItem ? 'Edit Extra Item' : 'Add Extra Item'}
              </Text>
              <TouchableOpacity onPress={() => setShowExtraItemModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={extraItemForm.name}
                  onChangeText={(text) => setExtraItemForm({ ...extraItemForm, name: text })}
                  placeholder="Item name"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={extraItemForm.description}
                  onChangeText={(text) => setExtraItemForm({ ...extraItemForm, description: text })}
                  placeholder="Description"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Price ($) *</Text>
                <TextInput
                  style={styles.input}
                  value={extraItemForm.price}
                  onChangeText={(text) => setExtraItemForm({ ...extraItemForm, price: text })}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight-Based Pricing (lbs)</Text>
                <TextInput
                  style={styles.input}
                  value={extraItemForm.perWeightUnit}
                  onChangeText={(text) => setExtraItemForm({ ...extraItemForm, perWeightUnit: text })}
                  placeholder="Leave empty for fixed price"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.inputHint}>
                  If set, price applies per X lbs (e.g., 15 = $price per 15 lbs)
                </Text>
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.inputLabel}>Active</Text>
                <Switch
                  value={extraItemForm.isActive}
                  onValueChange={(value) => setExtraItemForm({ ...extraItemForm, isActive: value })}
                  trackColor={{ false: '#e2e8f0', true: '#86efac' }}
                  thumbColor={extraItemForm.isActive ? '#10b981' : '#fff'}
                />
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowExtraItemModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveExtraItem}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Machine Modal */}
      <Modal visible={showMachineModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingMachine ? 'Edit Machine' : 'Add Machine'}
              </Text>
              <TouchableOpacity onPress={() => setShowMachineModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={machineForm.name}
                  onChangeText={(text) => setMachineForm({ ...machineForm, name: text })}
                  placeholder="Machine name"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>QR Code *</Text>
                <TextInput
                  style={styles.input}
                  value={machineForm.qrCode}
                  onChangeText={(text) => setMachineForm({ ...machineForm, qrCode: text })}
                  placeholder="QR code value"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Type</Text>
                <View style={styles.roleOptions}>
                  {(['washer', 'dryer'] as MachineType[]).map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.roleOption, machineForm.type === type && styles.roleOptionActive]}
                      onPress={() => setMachineForm({ ...machineForm, type })}
                    >
                      <Text style={[styles.roleOptionText, machineForm.type === type && styles.roleOptionTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.roleOptions}>
                  {(['available', 'in_use', 'maintenance'] as MachineStatus[]).map(status => (
                    <TouchableOpacity
                      key={status}
                      style={[styles.roleOption, machineForm.status === status && styles.roleOptionActive]}
                      onPress={() => setMachineForm({ ...machineForm, status })}
                    >
                      <Text style={[styles.roleOptionText, machineForm.status === status && styles.roleOptionTextActive]}>
                        {status.replace('_', ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowMachineModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveMachine}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettingsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Settings</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.sectionLabel}>Pricing</Text>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Min Weight (lbs)</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.minimumWeight}
                    onChangeText={(text) => setSettingsForm({ ...settingsForm, minimumWeight: text })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Min Price ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.minimumPrice}
                    onChangeText={(text) => setSettingsForm({ ...settingsForm, minimumPrice: text })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Price Per Pound ($)</Text>
                <TextInput
                  style={styles.input}
                  value={settingsForm.pricePerPound}
                  onChangeText={(text) => setSettingsForm({ ...settingsForm, pricePerPound: text })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <Text style={styles.sectionLabel}>Same Day Service</Text>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Extra $/lb</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.sameDayExtraCentsPerPound}
                    onChangeText={(text) => setSettingsForm({ ...settingsForm, sameDayExtraCentsPerPound: text })}
                    keyboardType="decimal-pad"
                    placeholder="0.50"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Min Charge ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.sameDayMinimumCharge}
                    onChangeText={(text) => setSettingsForm({ ...settingsForm, sameDayMinimumCharge: text })}
                    keyboardType="decimal-pad"
                    placeholder="5"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <Text style={styles.sectionLabel}>Store Location</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Store Address</Text>
                <TextInput
                  style={styles.input}
                  value={settingsForm.storeAddress}
                  onChangeText={(text) => setSettingsForm({ ...settingsForm, storeAddress: text })}
                  placeholder="123 Main St, City, State"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Latitude</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.storeLatitude}
                    onChangeText={(text) => setSettingsForm({ ...settingsForm, storeLatitude: text })}
                    keyboardType="decimal-pad"
                    placeholder="40.7128"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Longitude</Text>
                  <TextInput
                    style={styles.input}
                    value={settingsForm.storeLongitude}
                    onChangeText={(text) => setSettingsForm({ ...settingsForm, storeLongitude: text })}
                    keyboardType="decimal-pad"
                    placeholder="-74.0060"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              <Text style={styles.hintText}>
                Get coordinates from Google Maps by right-clicking on your store location.
              </Text>

              <Text style={styles.sectionLabel}>POS Thermal Printer</Text>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Printer IP Address</Text>
                <TextInput
                  style={styles.input}
                  value={settingsForm.thermalPrinterIp}
                  onChangeText={(text) => setSettingsForm({ ...settingsForm, thermalPrinterIp: text })}
                  placeholder="192.168.1.100"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Printer Port</Text>
                <TextInput
                  style={styles.input}
                  value={settingsForm.thermalPrinterPort}
                  onChangeText={(text) => setSettingsForm({ ...settingsForm, thermalPrinterPort: text })}
                  placeholder="9100"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                />
              </View>
              <Text style={styles.hintText}>
                Enter your thermal receipt printer's IP address. Default port is 9100.
              </Text>

            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSettingsModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveSettings}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Settings</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#fff',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  countText: {
    fontSize: 14,
    color: '#64748b',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
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
  cardInactive: {
    opacity: 0.6,
  },
  cardContent: {
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  priceText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10b981',
    marginTop: 4,
  },
  perWeightText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#7c3aed',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  weightBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7c3aed',
  },
  inputHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    fontStyle: 'italic',
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
  editSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  editSettingsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  hintText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  roleOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  roleOptionActive: {
    backgroundColor: '#2563eb',
  },
  roleOptionText: {
    fontSize: 14,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  roleOptionTextActive: {
    color: '#fff',
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    padding: 14,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Activity styles
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  activityUser: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  activityDetails: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    paddingLeft: 44,
  },
  // Printer styles
  printerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  printerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  printerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  connectedPrinterSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  connectedPrinterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  connectedPrinterName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  printerActionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  testPrintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
  },
  disconnectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 10,
  },
  editPrinterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#64748b',
    paddingVertical: 12,
    borderRadius: 10,
  },
  printerBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disconnectedPrinterSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
  },
  scanButtonActive: {
    backgroundColor: '#f59e0b',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  connectingText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  deviceList: {
    marginTop: 16,
  },
  deviceListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 10,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginBottom: 8,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
  },
  deviceId: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  printerHintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  printerHintText: {
    flex: 1,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
});
