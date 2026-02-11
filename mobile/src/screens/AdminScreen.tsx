import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Device } from 'react-native-ble-plx';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../services/api';
import { localPrinter } from '../services/LocalPrinter';
import { bluetoothPrinter } from '../services/BluetoothPrinter';
import { useAuth } from '../contexts/AuthContext';
import type { User, Customer, Settings, ExtraItem, Machine, MachineType, MachineStatus, UserRole, ActivityLog, TimeEntry, Location } from '../types';
import { formatPhoneNumber, formatPhoneInput } from '../utils/phoneFormat';

type Tab = 'users' | 'customers' | 'extras' | 'settings' | 'machines' | 'printers' | 'activity' | 'reports' | 'timeclock' | 'locations';

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const isCashier = currentUser?.role === 'cashier';

  // Cashiers default to customers tab, admins to users tab
  const [activeTab, setActiveTab] = useState<Tab>(isCashier ? 'customers' : 'users');
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
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityUserFilter, setActivityUserFilter] = useState<string>('all');
  const [activityActionFilter, setActivityActionFilter] = useState<string>('all');
  const [activityEntityFilter, setActivityEntityFilter] = useState<string>('all');
  const [activityLocationFilter, setActivityLocationFilter] = useState<string>('all');
  const [showActivityFilterModal, setShowActivityFilterModal] = useState(false);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [selectedTimeEntry, setSelectedTimeEntry] = useState<TimeEntry | null>(null);
  const [showTimeEntryPhotoModal, setShowTimeEntryPhotoModal] = useState(false);
  const [timeClockUserFilter, setTimeClockUserFilter] = useState<string>('all');
  const [showUserFilterModal, setShowUserFilterModal] = useState(false);

  // Locations
  const [locations, setLocations] = useState<Location[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locationForm, setLocationForm] = useState({ name: '', code: '', address: '', phone: '', email: '', isActive: true });

  // Printer state
  const [printerScanning, setPrinterScanning] = useState(false);
  const [printerConnecting, setPrinterConnecting] = useState(false);
  const [printerDevices, setPrinterDevices] = useState<Device[]>([]);
  const [connectedPrinterName, setConnectedPrinterName] = useState<string | null>(null);

  // Search
  const [customerSearch, setCustomerSearch] = useState('');

  // Machine filter
  const [machineTypeFilter, setMachineTypeFilter] = useState<'all' | 'washer' | 'dryer'>('all');
  const machinesListRef = useRef<FlatList>(null);

  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [showExtraItemModal, setShowExtraItemModal] = useState(false);
  const [showMachineModal, setShowMachineModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Edit state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingExtraItem, setEditingExtraItem] = useState<ExtraItem | null>(null);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  // Maintenance modal state
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceMachine, setMaintenanceMachine] = useState<Machine | null>(null);
  const [maintenanceNotes, setMaintenanceNotes] = useState('');
  const [printingMaintenance, setPrintingMaintenance] = useState(false);
  const [maintenancePhotos, setMaintenancePhotos] = useState<string[]>([]);
  const [showMaintenanceCamera, setShowMaintenanceCamera] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const maintenanceCameraRef = useRef<CameraView>(null);

  // Form state for modals
  const [userForm, setUserForm] = useState({ email: '', firstName: '', lastName: '', role: 'employee' as UserRole, isDriver: false, password: '' });
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
      const [usersData, customersData, extraItemsData, settingsData, machinesData, activityData, locationsData] = await Promise.all([
        api.getUsers().catch(() => []),
        api.getCustomers(),
        api.getExtraItems().catch(() => []),
        api.getSettings(),
        api.getMachines().catch(() => []),
        api.getActivityLogs({ limit: 50 }).catch(() => ({ logs: [], total: 0 })),
        api.getLocations().catch(() => []),
      ]);
      setUsers(usersData);
      setCustomers(customersData);
      setExtraItems(extraItemsData);
      setSettings(settingsData);
      setMachines(machinesData);
      setActivityLogs(activityData.logs);
      setActivityTotal(activityData.total);
      setLocations(locationsData);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load filtered activity logs
  const loadActivityLogs = useCallback(async () => {
    setActivityLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 500 };
      if (activityUserFilter !== 'all') params.userId = activityUserFilter;
      if (activityActionFilter !== 'all') params.action = activityActionFilter;
      if (activityEntityFilter !== 'all') params.entityType = activityEntityFilter;
      if (activityLocationFilter !== 'all') params.locationId = activityLocationFilter;

      const data = await api.getActivityLogs(params);
      setActivityLogs(data.logs);
      setActivityTotal(data.total);
    } catch (error) {
      console.error('Failed to load activity logs:', error);
    } finally {
      setActivityLoading(false);
    }
  }, [activityUserFilter, activityActionFilter, activityEntityFilter, activityLocationFilter]);

  // Reload activity logs when filters change
  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityLogs();
    }
  }, [activeTab, loadActivityLogs]);

  // Refresh data when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Only check printer connection when on Printers tab
  useEffect(() => {
    if (activeTab === 'printers' && isAdmin) {
      checkPrinterConnection();
    }
  }, [activeTab, isAdmin]);

  // Load time entries when on Time Clock tab
  useEffect(() => {
    if (activeTab === 'timeclock' && isAdmin) {
      loadTimeEntries();
    }
  }, [activeTab, isAdmin]);

  const loadTimeEntries = async () => {
    setTimeEntriesLoading(true);
    try {
      const response = await api.getTimeEntries({ limit: 100 });
      setTimeEntries(response.entries);
    } catch (error) {
      console.error('Failed to load time entries:', error);
    } finally {
      setTimeEntriesLoading(false);
    }
  };

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
    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Printer Not Configured', 'Please set the thermal printer IP first.');
      return;
    }

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
        `Printer: ${printerIp}:${printerPort}\n` +
        '================================\n' +
        '\n\n\n' +
        '\x1D\x56\x00'; // Cut

      const result = await localPrinter.printReceipt(printerIp, testContent, printerPort);
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
        isDriver: user.isDriver || false,
        password: '',
      });
    } else {
      setEditingUser(null);
      setUserForm({ email: '', firstName: '', lastName: '', role: 'employee', isDriver: false, password: '' });
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.email || !userForm.firstName) {
      Alert.alert('Error', 'Please fill in email and first name');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Update user role and driver status
        await api.updateUser(editingUser._id, { role: userForm.role, isDriver: userForm.isDriver });
        Alert.alert('Success', 'User updated successfully');
      } else {
        // Create/invite new user
        if (!userForm.password) {
          Alert.alert('Error', 'Please provide a temporary password for the new user');
          setSaving(false);
          return;
        }
        await api.inviteUser({
          email: userForm.email,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          role: userForm.role,
          isDriver: userForm.isDriver,
          temporaryPassword: userForm.password,
        });
        Alert.alert('Success', 'User invited successfully');
      }
      setShowUserModal(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save user');
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

  const handleCopyExtraItems = async () => {
    try {
      // Use the existing locations array from state
      if (locations.length < 2) {
        Alert.alert('Error', 'Need at least 2 locations to copy items');
        return;
      }

      // Find current location and other locations
      const currentLocId = api.getLocationId();
      const otherLocations = locations.filter(l => l._id !== currentLocId);
      const currentLoc = locations.find(l => l._id === currentLocId);

      if (otherLocations.length === 0) {
        Alert.alert('Error', 'No other locations to copy from');
        return;
      }

      // Create alert buttons for each source location
      const buttons = otherLocations.map(loc => ({
        text: loc.name,
        onPress: async () => {
          try {
            const result = await api.copyExtraItems(loc._id, currentLocId!);
            Alert.alert(
              'Copy Complete',
              `Copied ${result.copied} items, skipped ${result.skipped} existing items.\n\n` +
              (result.copiedItems.length > 0 ? `Copied: ${result.copiedItems.join(', ')}` : '')
            );
            loadData();
          } catch (error: any) {
            const msg = error?.message || 'Failed to copy';
            Alert.alert('Error', msg);
          }
        },
      }));

      buttons.push({ text: 'Cancel', onPress: () => {} });

      Alert.alert(
        'Copy Extra Items',
        `Copy items to ${currentLoc?.name || 'current location'}.\nSelect source location:`,
        buttons as any
      );
    } catch (error: any) {
      console.error('Copy extra items error:', error);
      Alert.alert('Error', 'Failed to copy extra items');
    }
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
  const openMachineModal = async (machine?: Machine) => {
    if (machine) {
      setEditingMachine(machine);
      setMachineForm({
        name: machine.name,
        type: machine.type,
        qrCode: machine.qrCode,
        status: machine.status,
      });
      // Load existing maintenance notes if machine is in maintenance
      setMaintenanceNotes(machine.maintenanceNotes || '');
      // Load existing maintenance photos from server
      if (machine.status === 'maintenance') {
        try {
          const { photos } = await api.getMaintenancePhotos(machine._id);
          console.log('Loaded maintenance photos:', photos);
          const photoUrls = photos.map(p => {
            const url = api.getMaintenancePhotoUrl(p.photoPath);
            console.log('Photo URL:', url);
            return url;
          });
          setMaintenancePhotos(photoUrls);
        } catch (error) {
          console.error('Failed to load maintenance photos:', error);
          setMaintenancePhotos([]);
        }
      } else {
        setMaintenancePhotos([]);
      }
    } else {
      setEditingMachine(null);
      setMachineForm({ name: '', type: 'washer', qrCode: '', status: 'available' });
      setMaintenanceNotes('');
      setMaintenancePhotos([]);
    }
    setShowMachineModal(true);
  };

  const handleSaveMachine = async (shouldPrint: boolean = false) => {
    if (!machineForm.name || !machineForm.qrCode) {
      Alert.alert('Error', 'Please fill in name and QR code');
      return;
    }

    setSaving(true);
    try {
      // Include maintenance notes if setting to maintenance
      const updateData = machineForm.status === 'maintenance'
        ? { ...machineForm, maintenanceNotes: maintenanceNotes.trim() }
        : { ...machineForm, maintenanceNotes: '' };

      if (editingMachine) {
        await api.updateMachine(editingMachine._id, updateData);

        // Print maintenance label if requested
        if (shouldPrint && machineForm.status === 'maintenance' && settings?.thermalPrinterIp) {
          setPrintingMaintenance(true);
          await printMaintenanceLabel(editingMachine, maintenanceNotes.trim());
          setPrintingMaintenance(false);
        }

        Alert.alert('Success', 'Machine updated');
      } else {
        await api.createMachine({
          name: machineForm.name,
          type: machineForm.type,
          qrCode: machineForm.qrCode,
        });
        Alert.alert('Success', 'Machine created');
      }
      setShowMachineModal(false);
      setMaintenanceNotes('');
      loadData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save machine';
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
      setPrintingMaintenance(false);
    }
  };

  // Location actions
  const openLocationModal = (location?: Location) => {
    if (location) {
      setEditingLocation(location);
      setLocationForm({
        name: location.name,
        code: location.code,
        address: location.address,
        phone: location.phone || '',
        email: location.email || '',
        isActive: location.isActive,
      });
    } else {
      setEditingLocation(null);
      setLocationForm({ name: '', code: '', address: '', phone: '', email: '', isActive: true });
    }
    setShowLocationModal(true);
  };

  const handleSaveLocation = async () => {
    if (!locationForm.name || !locationForm.code || !locationForm.address) {
      Alert.alert('Error', 'Please fill in name, code, and address');
      return;
    }

    setSaving(true);
    try {
      if (editingLocation) {
        await api.updateLocation(editingLocation._id, locationForm);
        Alert.alert('Success', 'Location updated');
      } else {
        await api.createLocation(locationForm);
        Alert.alert('Success', 'Location created');
      }
      setShowLocationModal(false);
      loadData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save location';
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLocation = (location: Location) => {
    Alert.alert(
      'Delete Location',
      `Are you sure you want to delete "${location.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteLocation(location._id);
              Alert.alert('Success', 'Location deleted');
              loadData();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to delete location';
              Alert.alert('Error', errorMessage);
            }
          },
        },
      ]
    );
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

  // Filtered and sorted machines
  const filteredMachines = machines
    .filter(m => machineTypeFilter === 'all' || m.type === machineTypeFilter)
    .sort((a, b) => {
      // Sort by status: available first, then in_use, then maintenance
      const statusOrder = { available: 0, in_use: 1, maintenance: 2 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      // Then sort by name
      return a.name.localeCompare(b.name);
    });

  // Quick toggle maintenance
  const handleToggleMaintenance = async (machine: Machine) => {
    if (machine.status === 'maintenance') {
      // Remove from maintenance
      try {
        await api.updateMachine(machine._id, { ...machine, status: 'available', maintenanceNotes: '' });
        setMachines(machines.map(m =>
          m._id === machine._id ? { ...m, status: 'available', maintenanceNotes: '' } : m
        ));
      } catch (error) {
        Alert.alert('Error', 'Failed to update machine status');
      }
    } else {
      // Show modal to enter maintenance notes
      setMaintenanceMachine(machine);
      setMaintenanceNotes('');
      setShowMaintenanceModal(true);
    }
  };

  // Confirm maintenance with notes and optional print
  const handleConfirmMaintenance = async (shouldPrint: boolean) => {
    if (!maintenanceMachine) return;

    try {
      // If we came from the edit modal, include form changes
      const updateData = editingMachine?._id === maintenanceMachine._id
        ? { ...machineForm, status: 'maintenance' as MachineStatus, maintenanceNotes: maintenanceNotes.trim() }
        : { ...maintenanceMachine, status: 'maintenance' as MachineStatus, maintenanceNotes: maintenanceNotes.trim() };

      await api.updateMachine(maintenanceMachine._id, updateData);
      setMachines(machines.map(m =>
        m._id === maintenanceMachine._id ? { ...m, ...updateData } : m
      ));

      if (shouldPrint && settings?.thermalPrinterIp) {
        setPrintingMaintenance(true);
        await printMaintenanceLabel(maintenanceMachine, maintenanceNotes.trim());
        setPrintingMaintenance(false);
      }

      setShowMaintenanceModal(false);
      setMaintenanceMachine(null);
      setMaintenanceNotes('');
      setEditingMachine(null);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to update machine status');
    }
  };

  // Print maintenance label to thermal printer
  const printMaintenanceLabel = async (machine: Machine, notes: string) => {
    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Error', 'Thermal printer IP not configured');
      return;
    }

    // ESC/POS commands
    const ESC = {
      INIT: '\x1B\x40',
      CENTER: '\x1B\x61\x01',
      LEFT: '\x1B\x61\x00',
      BOLD_ON: '\x1B\x45\x01',
      BOLD_OFF: '\x1B\x45\x00',
      DOUBLE_SIZE: '\x1B\x21\x30',
      DOUBLE_HEIGHT: '\x1B\x21\x10',
      NORMAL: '\x1B\x21\x00',
      INVERT_ON: '\x1D\x42\x01',
      INVERT_OFF: '\x1D\x42\x00',
      CUT: '\n\n\n\x1D\x56\x00',
    };

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${month}/${day}/${year}`;

    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeStr = `${hours}:${minutes} ${ampm}`;

    let content = '';
    content += ESC.INIT;
    content += ESC.CENTER;

    // Header - large inverted
    content += ESC.DOUBLE_SIZE;
    content += ESC.INVERT_ON;
    content += ' OUT OF ORDER \n';
    content += ESC.INVERT_OFF;
    content += ESC.NORMAL;
    content += '\n\n';

    // Machine info - large
    content += ESC.DOUBLE_SIZE;
    content += ESC.BOLD_ON;
    content += `${machine.type.toUpperCase()} ${machine.name}\n`;
    content += ESC.BOLD_OFF;
    content += ESC.NORMAL;
    content += '\n\n';

    // Issue details - double height for readability
    if (notes) {
      content += ESC.LEFT;
      content += ESC.DOUBLE_HEIGHT;
      content += ESC.BOLD_ON;
      content += 'Issue:\n';
      content += ESC.BOLD_OFF;
      content += ESC.DOUBLE_HEIGHT;
      // Word wrap notes at shorter length for double height
      const maxLineLen = 20;
      for (let i = 0; i < notes.length; i += maxLineLen) {
        content += notes.substring(i, i + maxLineLen).trim() + '\n';
      }
      content += ESC.NORMAL;
      content += '\n\n';
    }

    // Date/Time - double height
    content += ESC.CENTER;
    content += ESC.DOUBLE_HEIGHT;
    content += `${dateStr} ${timeStr}\n`;
    content += ESC.NORMAL;
    content += '\n\n';

    // Footer - double height
    content += ESC.DOUBLE_HEIGHT;
    content += ESC.BOLD_ON;
    content += 'Please use another machine\n';
    content += ESC.BOLD_OFF;
    content += 'Sorry for the inconvenience\n';
    content += ESC.NORMAL;

    // More space before cut
    content += '\n\n\n\n';
    content += ESC.CUT;

    try {
      const { localPrinter } = require('../services/LocalPrinter');
      const result = await localPrinter.printReceipt(printerIp, content, printerPort);
      if (!result.success) {
        Alert.alert('Print Error', result.error || 'Failed to print');
      }
    } catch (error) {
      console.error('Print error:', error);
      Alert.alert('Error', 'Failed to print maintenance label');
    }
  };

  // Take maintenance photo
  const openMaintenanceCamera = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos');
        return;
      }
    }
    // Close machine modal first, then open camera
    setShowMachineModal(false);
    setTimeout(() => {
      setShowMaintenanceCamera(true);
    }, 300);
  };

  const takeMaintenancePhoto = async () => {
    if (!maintenanceCameraRef.current || !editingMachine) return;

    try {
      const photo = await maintenanceCameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (photo?.base64) {
        setShowMaintenanceCamera(false);

        // Upload to server
        try {
          console.log('Uploading maintenance photo for machine:', editingMachine._id);
          const result = await api.uploadMaintenancePhoto(
            editingMachine._id,
            `data:image/jpeg;base64,${photo.base64}`
          );
          console.log('Upload result:', result);
          if (result.success) {
            const photoUrl = api.getMaintenancePhotoUrl(result.photoPath);
            console.log('Generated photo URL:', photoUrl);
            setMaintenancePhotos(prev => [...prev, photoUrl]);
          }
        } catch (uploadError) {
          console.error('Failed to upload photo:', uploadError);
          Alert.alert('Error', 'Failed to upload photo');
        }

        // Reopen machine modal
        setTimeout(() => {
          setShowMachineModal(true);
        }, 300);
      }
    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const closeMaintenanceCamera = () => {
    setShowMaintenanceCamera(false);
    // Reopen machine modal
    setTimeout(() => {
      setShowMachineModal(true);
    }, 300);
  };

  const removeMaintenancePhoto = (index: number) => {
    // Note: This only removes from local state, not from server
    // For full implementation, would need to track photo IDs and delete from server
    setMaintenancePhotos(prev => prev.filter((_, i) => i !== index));
  };

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

  // All available tabs
  const allTabs = [
    { key: 'users', label: 'Users', icon: 'people', adminOnly: true },
    { key: 'customers', label: 'Customers', icon: 'person', adminOnly: false },
    { key: 'extras', label: 'Extras', icon: 'pricetags', adminOnly: false },
    { key: 'settings', label: 'Settings', icon: 'settings', adminOnly: true },
    { key: 'machines', label: 'Machines', icon: 'hardware-chip', adminOnly: true },
    { key: 'printers', label: 'Printers', icon: 'print', adminOnly: true },
    { key: 'reports', label: 'Reports', icon: 'document-text', adminOnly: false },
    { key: 'timeclock', label: 'Time Clock', icon: 'timer', adminOnly: true },
    { key: 'activity', label: 'Activity', icon: 'time', adminOnly: true },
    { key: 'locations', label: 'Locations', icon: 'location', adminOnly: true },
  ];

  // Filter tabs based on role - cashiers only see non-admin tabs
  const tabs = isAdmin ? allTabs : allTabs.filter(tab => !tab.adminOnly);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? 16 : insets.top + 16 }]}>
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
          </View>
          <FlatList
            data={users}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: customer }) => (
              <TouchableOpacity style={styles.card} onPress={() => handleEditCustomer(customer)}>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{customer.name}</Text>
                  <Text style={styles.cardSubtitle}>{formatPhoneNumber(customer.phoneNumber)}</Text>
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
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
        <View style={{ flex: 1 }}>
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
        </View>
      )}

      {/* Printers Tab */}
      {activeTab === 'printers' && (
        <View style={{ flex: 1 }}>
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
        </View>
      )}

      {/* Machines Tab */}
      {activeTab === 'machines' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionHeader}>
            <Text style={styles.countText}>{filteredMachines.length} machines</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => openMachineModal()}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Machine</Text>
            </TouchableOpacity>
          </View>

          {/* Machine Type Filter Tabs */}
          <View style={styles.machineFilterTabs}>
            {(['all', 'washer', 'dryer'] as const).map(filter => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.machineFilterTab,
                  machineTypeFilter === filter && styles.machineFilterTabActive,
                  filter === 'washer' && machineTypeFilter === filter && { backgroundColor: '#06b6d4' },
                  filter === 'dryer' && machineTypeFilter === filter && { backgroundColor: '#f97316' },
                ]}
                onPress={() => {
                  setMachineTypeFilter(filter);
                  machinesListRef.current?.scrollToOffset({ offset: 0, animated: false });
                }}
              >
                <Ionicons
                  name={filter === 'washer' ? 'water' : filter === 'dryer' ? 'flame' : 'grid'}
                  size={16}
                  color={machineTypeFilter === filter ? '#fff' : '#64748b'}
                />
                <Text style={[
                  styles.machineFilterTabText,
                  machineTypeFilter === filter && styles.machineFilterTabTextActive,
                ]}>
                  {filter === 'all' ? 'All' : filter === 'washer' ? 'Washers' : 'Dryers'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            ref={machinesListRef}
            data={filteredMachines}
            keyExtractor={(item) => item._id}
            numColumns={4}
            contentContainerStyle={styles.machineGridContent}
            columnWrapperStyle={styles.machineGridRow}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: machine }) => (
              <TouchableOpacity
                style={[
                  styles.machineGridItem,
                  machine.status === 'maintenance' && styles.machineGridItemMaintenance,
                  machine.status === 'in_use' && styles.machineGridItemInUse,
                ]}
                onPress={() => openMachineModal(machine)}
              >
                <View style={[
                  styles.machineGridIcon,
                  { backgroundColor: machine.type === 'washer' ? '#ecfeff' : '#fff7ed' }
                ]}>
                  <Ionicons
                    name={machine.type === 'washer' ? 'water' : 'flame'}
                    size={22}
                    color={machine.type === 'washer' ? '#06b6d4' : '#f97316'}
                  />
                </View>
                <Text style={styles.machineGridName}>{machine.name}</Text>
                <Text style={styles.machineGridQR}>{machine.qrCode}</Text>
                <View style={[
                  styles.machineGridStatus,
                  {
                    backgroundColor: machine.status === 'available' ? '#dcfce7' :
                      machine.status === 'in_use' ? '#dbeafe' : '#fee2e2',
                  }
                ]}>
                  <Text style={[
                    styles.machineGridStatusText,
                    {
                      color: machine.status === 'available' ? '#166534' :
                        machine.status === 'in_use' ? '#1e40af' : '#991b1b',
                    }
                  ]}>
                    {machine.status.replace('_', ' ')}
                  </Text>
                </View>
                {machine.status === 'maintenance' && machine.maintenanceNotes && (
                  <Text style={styles.machineGridNotes} numberOfLines={2}>
                    {machine.maintenanceNotes}
                  </Text>
                )}
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
      {activeTab === 'reports' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
          <TouchableOpacity
            style={styles.reportCard}
            onPress={() => navigation.navigate('CashierReport')}
          >
            <View style={[styles.reportIcon, { backgroundColor: '#dcfce7' }]}>
              <Ionicons name="cash" size={28} color="#10b981" />
            </View>
            <View style={styles.reportInfo}>
              <Text style={styles.reportTitle}>Cashier Report</Text>
              <Text style={styles.reportDescription}>Daily payment summary by cashier</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reportCard}
            onPress={() => navigation.navigate('EODReport')}
          >
            <View style={[styles.reportIcon, { backgroundColor: '#dbeafe' }]}>
              <Ionicons name="document-text" size={28} color="#3b82f6" />
            </View>
            <View style={styles.reportInfo}>
              <Text style={styles.reportTitle}>End of Day Report</Text>
              <Text style={styles.reportDescription}>Closing checklist & daily summary</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#94a3b8" />
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === 'activity' && (
        <View style={{ flex: 1 }}>
          {/* Filter Bar */}
          <View style={styles.activityFilterBar}>
            <TouchableOpacity
              style={styles.activityFilterButton}
              onPress={() => setShowActivityFilterModal(true)}
            >
              <Ionicons name="filter" size={18} color="#2563eb" />
              <Text style={styles.activityFilterButtonText}>Filters</Text>
              {(activityUserFilter !== 'all' || activityActionFilter !== 'all' ||
                activityEntityFilter !== 'all' || activityLocationFilter !== 'all') && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    {[activityUserFilter, activityActionFilter, activityEntityFilter, activityLocationFilter]
                      .filter(f => f !== 'all').length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.countText}>{activityTotal} activities</Text>
            {activityLoading && <ActivityIndicator size="small" color="#2563eb" />}
          </View>
          <FlatList
            data={activityLogs}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadActivityLogs()} />}
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

      {/* Activity Filter Modal */}
      <Modal visible={showActivityFilterModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Activity Logs</Text>
              <TouchableOpacity onPress={() => setShowActivityFilterModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              {/* User Dropdown */}
              <Text style={[styles.dropdownLabel, { marginTop: 0 }]}>User</Text>
              <View style={styles.dropdownContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[{ _id: 'all', label: 'All Users' }, ...users.map(u => ({ _id: u._id, label: `${u.firstName} ${u.lastName}` }))].map(option => (
                    <TouchableOpacity
                      key={option._id}
                      style={[styles.dropdownChip, activityUserFilter === option._id && styles.dropdownChipActive]}
                      onPress={() => setActivityUserFilter(option._id)}
                    >
                      <Text style={[styles.dropdownChipText, activityUserFilter === option._id && styles.dropdownChipTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Action Dropdown */}
              <Text style={styles.dropdownLabel}>Action</Text>
              <View style={styles.dropdownContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {['all', 'login', 'logout', 'create_order', 'update_order', 'delete_order', 'status_change',
                    'payment_update', 'price_override', 'create_customer', 'update_customer', 'delete_customer',
                    'create_user', 'update_user', 'delete_user', 'create_extra_item', 'update_extra_item',
                    'update_settings', 'assign_washer', 'assign_dryer', 'release_machine',
                    'clock_in', 'clock_out', 'break_start', 'break_end'].map(action => (
                    <TouchableOpacity
                      key={action}
                      style={[styles.dropdownChip, activityActionFilter === action && styles.dropdownChipActive]}
                      onPress={() => setActivityActionFilter(action)}
                    >
                      <Text style={[styles.dropdownChipText, activityActionFilter === action && styles.dropdownChipTextActive]}>
                        {action === 'all' ? 'All Actions' : formatAction(action)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Entity Type Dropdown */}
              <Text style={styles.dropdownLabel}>Entity Type</Text>
              <View style={styles.dropdownContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {['all', 'order', 'customer', 'user', 'extra_item', 'settings', 'machine', 'time_entry'].map(entity => (
                    <TouchableOpacity
                      key={entity}
                      style={[styles.dropdownChip, activityEntityFilter === entity && styles.dropdownChipActive]}
                      onPress={() => setActivityEntityFilter(entity)}
                    >
                      <Text style={[styles.dropdownChipText, activityEntityFilter === entity && styles.dropdownChipTextActive]}>
                        {entity === 'all' ? 'All Types' : entity.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Location Dropdown */}
              <Text style={styles.dropdownLabel}>Location</Text>
              <View style={styles.dropdownContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[{ _id: 'all', name: 'All Locations' }, ...locations].map(loc => (
                    <TouchableOpacity
                      key={loc._id}
                      style={[styles.dropdownChip, activityLocationFilter === loc._id && styles.dropdownChipActive]}
                      onPress={() => setActivityLocationFilter(loc._id)}
                    >
                      <Text style={[styles.dropdownChipText, activityLocationFilter === loc._id && styles.dropdownChipTextActive]}>
                        {loc.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setActivityUserFilter('all');
                  setActivityActionFilter('all');
                  setActivityEntityFilter('all');
                  setActivityLocationFilter('all');
                }}
              >
                <Text style={styles.modalButtonSecondaryText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => setShowActivityFilterModal(false)}
              >
                <Text style={styles.modalButtonPrimaryText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Time Clock Tab */}
      {activeTab === 'timeclock' && (
        <View style={{ flex: 1 }}>
          {/* User Filter Dropdown */}
          <View style={styles.timeClockFilterBar}>
            <TouchableOpacity
              style={styles.userDropdown}
              onPress={() => setShowUserFilterModal(true)}
            >
              <Ionicons name="person" size={18} color="#64748b" />
              <Text style={styles.userDropdownText}>
                {timeClockUserFilter === 'all'
                  ? 'All Users'
                  : users.find(u => u._id === timeClockUserFilter)
                    ? `${users.find(u => u._id === timeClockUserFilter)?.firstName} ${users.find(u => u._id === timeClockUserFilter)?.lastName}`
                    : 'Select User'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
          {timeEntriesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563eb" />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    loadTimeEntries().then(() => setRefreshing(false));
                  }}
                />
              }
            >
              {(() => {
                // Filter entries by selected user
                const filteredEntries = timeClockUserFilter === 'all'
                  ? timeEntries
                  : timeEntries.filter(e => e.userId === timeClockUserFilter);

                // Group entries by user and date
                const groupedByUserDate: Record<string, TimeEntry[]> = {};
                filteredEntries.forEach(entry => {
                  const date = new Date(entry.timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });
                  const key = `${entry.userId}_${date}`;
                  if (!groupedByUserDate[key]) {
                    groupedByUserDate[key] = [];
                  }
                  groupedByUserDate[key].push(entry);
                });

                // Sort groups by date (most recent first)
                const sortedGroups = Object.entries(groupedByUserDate).sort((a, b) => {
                  const dateA = new Date(a[1][0].timestamp);
                  const dateB = new Date(b[1][0].timestamp);
                  return dateB.getTime() - dateA.getTime();
                });

                if (sortedGroups.length === 0) {
                  return (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="timer-outline" size={48} color="#cbd5e1" />
                      <Text style={styles.emptyText}>No time entries yet</Text>
                      <Text style={styles.emptySubtext}>
                        Employee clock-ins will appear here
                      </Text>
                    </View>
                  );
                }

                return sortedGroups.map(([groupKey, entries]) => {
                  // Sort entries by time (oldest first for proper calculation)
                  const sortedEntries = [...entries].sort((a, b) =>
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  );

                  const userName = sortedEntries[0].userName;
                  const date = new Date(sortedEntries[0].timestamp).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  });

                  // Calculate times
                  let totalBreakMs = 0;
                  let breakStartTime: Date | null = null;

                  const clockIn = sortedEntries.find(e => e.type === 'clock_in');
                  const clockOut = sortedEntries.find(e => e.type === 'clock_out');

                  // Calculate break time
                  sortedEntries.forEach(entry => {
                    if (entry.type === 'break_start') {
                      breakStartTime = new Date(entry.timestamp);
                    } else if (entry.type === 'break_end' && breakStartTime) {
                      totalBreakMs += new Date(entry.timestamp).getTime() - breakStartTime.getTime();
                      breakStartTime = null;
                    }
                  });

                  // If still on break, calculate up to now
                  if (breakStartTime) {
                    totalBreakMs += Date.now() - breakStartTime.getTime();
                  }

                  // Calculate work time
                  let totalWorkMs = 0;
                  if (clockIn) {
                    const endTime = clockOut ? new Date(clockOut.timestamp) : new Date();
                    totalWorkMs = endTime.getTime() - new Date(clockIn.timestamp).getTime() - totalBreakMs;
                  }

                  const formatDuration = (ms: number) => {
                    const hours = Math.floor(ms / (1000 * 60 * 60));
                    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
                    if (hours > 0) {
                      return `${hours}h ${minutes}m`;
                    }
                    return `${minutes}m`;
                  };

                  return (
                    <View key={groupKey} style={styles.timeEntryGroup}>
                      {/* Group Header */}
                      <View style={styles.timeEntryGroupHeader}>
                        <View style={styles.timeEntryGroupHeaderLeft}>
                          <Text style={styles.timeEntryGroupName}>{userName}</Text>
                          <Text style={styles.timeEntryGroupDate}>{date}</Text>
                        </View>
                        <View style={styles.timeEntryGroupStats}>
                          {totalWorkMs > 0 && (
                            <View style={styles.timeEntryStat}>
                              <Ionicons name="time" size={14} color="#16a34a" />
                              <Text style={[styles.timeEntryStatText, { color: '#16a34a' }]}>
                                {formatDuration(totalWorkMs)}
                              </Text>
                            </View>
                          )}
                          {totalBreakMs > 0 && (
                            <View style={styles.timeEntryStat}>
                              <Ionicons name="cafe" size={14} color="#d97706" />
                              <Text style={[styles.timeEntryStatText, { color: '#d97706' }]}>
                                {formatDuration(totalBreakMs)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Entries (reverse for display - most recent first) */}
                      {[...sortedEntries].reverse().map(entry => {
                        const entryDate = new Date(entry.timestamp);
                        const getEntryConfig = () => {
                          if (entry.type === 'clock_in') return { bg: '#dcfce7', color: '#16a34a', icon: 'log-in' as const, label: 'Clock In' };
                          if (entry.type === 'break_start') return { bg: '#fef3c7', color: '#d97706', icon: 'cafe' as const, label: 'Break Start' };
                          if (entry.type === 'break_end') return { bg: '#dbeafe', color: '#2563eb', icon: 'cafe-outline' as const, label: 'Break End' };
                          return { bg: '#fee2e2', color: '#dc2626', icon: 'log-out' as const, label: 'Clock Out' };
                        };
                        const config = getEntryConfig();

                        return (
                          <TouchableOpacity
                            key={entry._id}
                            style={styles.timeEntryItem}
                            onPress={() => {
                              if (entry.photoPath) {
                                setSelectedTimeEntry(entry);
                                setShowTimeEntryPhotoModal(true);
                              }
                            }}
                          >
                            <View style={[styles.timeEntryItemDot, { backgroundColor: config.color }]} />
                            <View style={styles.timeEntryItemContent}>
                              <Text style={[styles.timeEntryItemLabel, { color: config.color }]}>
                                {config.label}
                              </Text>
                              <Text style={styles.timeEntryItemTime}>
                                {entryDate.toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </Text>
                            </View>
                            {entry.location?.address && (
                              <Text style={styles.timeEntryItemLocation} numberOfLines={1}>
                                {entry.location.address}
                              </Text>
                            )}
                            {entry.photoPath && (
                              <Ionicons name="camera" size={16} color="#3b82f6" style={{ marginLeft: 8 }} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                });
              })()}
            </ScrollView>
          )}
        </View>
      )}

      {/* Locations Tab */}
      {activeTab === 'locations' && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionHeader}>
            <Text style={styles.sectionTitle}>Locations ({locations.length})</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => openLocationModal()}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Location</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={locations}
            keyExtractor={(item) => item._id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 2,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{
                        backgroundColor: '#2563eb',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 6,
                        marginRight: 10,
                      }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{item.code}</Text>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: '#1e293b', flex: 1 }}>{item.name}</Text>
                      <View style={{
                        backgroundColor: item.isActive ? '#dcfce7' : '#fee2e2',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}>
                        <Text style={{ color: item.isActive ? '#16a34a' : '#dc2626', fontSize: 11, fontWeight: '500' }}>
                          {item.isActive ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                      <Ionicons name="location-outline" size={16} color="#64748b" style={{ marginRight: 6, marginTop: 2 }} />
                      <Text style={{ fontSize: 14, color: '#64748b', flex: 1 }}>{item.address}</Text>
                    </View>
                    {item.phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons name="call-outline" size={16} color="#64748b" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 14, color: '#64748b' }}>{formatPhoneNumber(item.phone)}</Text>
                      </View>
                    )}
                    {item.email && (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="mail-outline" size={16} color="#64748b" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 14, color: '#64748b' }}>{item.email}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 }}>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#eff6ff',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                    onPress={() => openLocationModal(item)}
                  >
                    <Ionicons name="pencil" size={16} color="#2563eb" />
                    <Text style={{ color: '#2563eb', marginLeft: 4, fontWeight: '500' }}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#fef2f2',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                    }}
                    onPress={() => handleDeleteLocation(item)}
                  >
                    <Ionicons name="trash" size={16} color="#dc2626" />
                    <Text style={{ color: '#dc2626', marginLeft: 4, fontWeight: '500' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="location-outline" size={48} color="#cbd5e1" />
                <Text style={{ color: '#94a3b8', fontSize: 16, marginTop: 12 }}>No locations found</Text>
                <Text style={{ color: '#cbd5e1', fontSize: 14 }}>Tap "Add Location" to create one</Text>
              </View>
            }
          />
        </View>
      )}

      {/* User Modal */}
      <Modal visible={showUserModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingUser ? 'Edit User' : 'Add User'}
              </Text>
              <TouchableOpacity onPress={() => setShowUserModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
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
                  <Text style={styles.inputLabel}>Last Name</Text>
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
                  {['employee', 'cashier', 'admin'].map(role => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.roleOption, userForm.role === role && styles.roleOptionActive]}
                      onPress={() => setUserForm({ ...userForm, role: role as UserRole })}
                    >
                      <Text style={[styles.roleOptionText, userForm.role === role && styles.roleOptionTextActive]}>
                        {role === 'employee' ? 'Employee' : role === 'cashier' ? 'Cashier' : 'Admin'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.inputGroup}>
                <View style={styles.driverToggleRow}>
                  <View>
                    <Text style={styles.inputLabel}>Driver Access</Text>
                    <Text style={styles.driverToggleHint}>Can access Driver tab for deliveries</Text>
                  </View>
                  <Switch
                    value={userForm.isDriver}
                    onValueChange={(value) => setUserForm({ ...userForm, isDriver: value })}
                    trackColor={{ false: '#e2e8f0', true: '#86efac' }}
                    thumbColor={userForm.isDriver ? '#10b981' : '#94a3b8'}
                  />
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Extra Item Modal */}
      <Modal visible={showExtraItemModal} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.modalTitle}>
              {editingExtraItem ? 'Edit Extra Item' : 'Add Extra Item'}
            </Text>
            <TouchableOpacity onPress={() => setShowExtraItemModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16 }}
            enableOnAndroid={true}
            extraScrollHeight={20}
            keyboardShouldPersistTaps="handled"
          >
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
          </KeyboardAwareScrollView>
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
      </Modal>

      {/* Machine Modal */}
      <Modal visible={showMachineModal} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingMachine ? 'Edit Machine' : 'Add Machine'}
            </Text>
            <TouchableOpacity onPress={() => setShowMachineModal(false)}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalBody}
            enableOnAndroid={true}
            extraScrollHeight={20}
            keyboardShouldPersistTaps="handled"
          >
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
              {machineForm.status === 'maintenance' && (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Maintenance Issue</Text>
                    <TextInput
                      style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                      value={maintenanceNotes}
                      onChangeText={setMaintenanceNotes}
                      placeholder="Describe the issue (e.g., Door won't close, water leak...)"
                      placeholderTextColor="#94a3b8"
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Photos</Text>
                    <View style={styles.maintenancePhotosContainer}>
                      {maintenancePhotos.map((uri, index) => (
                        <View key={index} style={styles.maintenancePhotoWrapper}>
                          <Image source={{ uri }} style={styles.maintenancePhoto} />
                          <TouchableOpacity
                            style={styles.maintenancePhotoRemove}
                            onPress={() => removeMaintenancePhoto(index)}
                          >
                            <Ionicons name="close-circle" size={22} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity
                        style={styles.maintenanceAddPhoto}
                        onPress={openMaintenanceCamera}
                      >
                        <Ionicons name="camera" size={28} color="#64748b" />
                        <Text style={styles.maintenanceAddPhotoText}>Add Photo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
          </KeyboardAwareScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowMachineModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            {machineForm.status === 'maintenance' && editingMachine?.status !== 'maintenance' && (
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: '#2563eb', marginRight: 8 }, saving && styles.saveBtnDisabled]}
                onPress={() => handleSaveMachine(true)}
                disabled={saving || printingMaintenance}
              >
                {printingMaintenance ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="print" size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>Save & Print</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={() => handleSaveMachine(false)}
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
      </Modal>

      {/* Location Modal */}
      <Modal visible={showLocationModal} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingLocation ? 'Edit Location' : 'Add Location'}
            </Text>
            <TouchableOpacity
              onPress={() => setShowLocationModal(false)}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalBody}
            enableOnAndroid={true}
            extraScrollHeight={20}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={locationForm.name}
                onChangeText={(text) => setLocationForm({ ...locationForm, name: text })}
                placeholder="Location name (e.g., Main Store)"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Code *</Text>
              <TextInput
                style={styles.input}
                value={locationForm.code}
                onChangeText={(text) => setLocationForm({ ...locationForm, code: text.toUpperCase() })}
                placeholder="Short code (e.g., MAIN)"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                maxLength={10}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address *</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={locationForm.address}
                onChangeText={(text) => setLocationForm({ ...locationForm, address: text })}
                placeholder="Full address"
                placeholderTextColor="#94a3b8"
                multiline
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={locationForm.phone}
                onChangeText={(text) => setLocationForm({ ...locationForm, phone: formatPhoneInput(text) })}
                placeholder="(555) 555-5555"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={locationForm.email}
                onChangeText={(text) => setLocationForm({ ...locationForm, email: text })}
                placeholder="Email address"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View style={[styles.inputGroup, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={styles.inputLabel}>Active</Text>
              <Switch
                value={locationForm.isActive}
                onValueChange={(value) => setLocationForm({ ...locationForm, isActive: value })}
                trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
                thumbColor={locationForm.isActive ? '#2563eb' : '#94a3b8'}
              />
            </View>
          </KeyboardAwareScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveLocation}
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
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettingsModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Settings</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
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
        </KeyboardAvoidingView>
      </Modal>

      {/* User Filter Modal */}
      <Modal visible={showUserFilterModal} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.userFilterModalOverlay}
          activeOpacity={1}
          onPress={() => setShowUserFilterModal(false)}
        >
          <View style={styles.userFilterModalContent}>
            <View style={styles.userFilterModalHeader}>
              <Text style={styles.userFilterModalTitle}>Select Employee</Text>
              <TouchableOpacity onPress={() => setShowUserFilterModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.userFilterModalList}>
              <TouchableOpacity
                style={[
                  styles.userFilterModalItem,
                  timeClockUserFilter === 'all' && styles.userFilterModalItemActive
                ]}
                onPress={() => {
                  setTimeClockUserFilter('all');
                  setShowUserFilterModal(false);
                }}
              >
                <Ionicons name="people" size={20} color={timeClockUserFilter === 'all' ? '#2563eb' : '#64748b'} />
                <Text style={[
                  styles.userFilterModalItemText,
                  timeClockUserFilter === 'all' && styles.userFilterModalItemTextActive
                ]}>
                  All Users
                </Text>
                {timeClockUserFilter === 'all' && (
                  <Ionicons name="checkmark" size={20} color="#2563eb" />
                )}
              </TouchableOpacity>
              {users.filter(u => u.isActive).map(user => (
                <TouchableOpacity
                  key={user._id}
                  style={[
                    styles.userFilterModalItem,
                    timeClockUserFilter === user._id && styles.userFilterModalItemActive
                  ]}
                  onPress={() => {
                    setTimeClockUserFilter(user._id);
                    setShowUserFilterModal(false);
                  }}
                >
                  <View style={styles.userFilterAvatar}>
                    <Text style={styles.userFilterAvatarText}>
                      {user.firstName?.[0]}{user.lastName?.[0]}
                    </Text>
                  </View>
                  <Text style={[
                    styles.userFilterModalItemText,
                    timeClockUserFilter === user._id && styles.userFilterModalItemTextActive
                  ]}>
                    {user.firstName} {user.lastName}
                  </Text>
                  {timeClockUserFilter === user._id && (
                    <Ionicons name="checkmark" size={20} color="#2563eb" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Time Entry Photo Modal */}
      <Modal visible={showTimeEntryPhotoModal} animationType="fade" transparent>
        <View style={styles.photoModalOverlay}>
          <View style={styles.photoModalContent}>
            <View style={styles.photoModalHeader}>
              <Text style={styles.photoModalTitle}>
                {selectedTimeEntry?.type === 'clock_in' ? 'Clock In' :
                 selectedTimeEntry?.type === 'clock_out' ? 'Clock Out' :
                 selectedTimeEntry?.type === 'break_start' ? 'Break Start' : 'Break End'} Photo
              </Text>
              <TouchableOpacity
                style={styles.photoModalCloseBtn}
                onPress={() => {
                  setShowTimeEntryPhotoModal(false);
                  setSelectedTimeEntry(null);
                }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            {selectedTimeEntry?.photoPath && (
              <Image
                source={{ uri: api.getTimeEntryPhotoUrl(selectedTimeEntry.photoPath) }}
                style={styles.photoModalImage}
                resizeMode="contain"
              />
            )}
            <View style={styles.photoModalDetails}>
              <Text style={styles.photoModalName}>{selectedTimeEntry?.userName}</Text>
              <Text style={styles.photoModalTime}>
                {selectedTimeEntry && new Date(selectedTimeEntry.timestamp).toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </Text>
              {selectedTimeEntry?.location && (
                <View style={styles.photoModalLocation}>
                  <Ionicons name="location" size={16} color="#64748b" />
                  <Text style={styles.photoModalLocationText}>
                    {selectedTimeEntry.location.address ||
                      `${selectedTimeEntry.location.latitude.toFixed(4)}, ${selectedTimeEntry.location.longitude.toFixed(4)}`}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Maintenance Modal */}
      <Modal visible={showMaintenanceModal} animationType="fade" transparent>
        <View style={styles.maintenanceModalOverlay}>
          <View style={styles.maintenanceModalContent}>
            <View style={styles.maintenanceModalHeader}>
              <Text style={styles.maintenanceModalTitle}>Set Machine to Maintenance</Text>
              <TouchableOpacity
                style={styles.maintenanceCloseBtn}
                onPress={() => {
                  setShowMaintenanceModal(false);
                  setMaintenanceMachine(null);
                  setMaintenanceNotes('');
                }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            {maintenanceMachine && (
              <Text style={styles.maintenanceMachineName}>
                {maintenanceMachine.type.charAt(0).toUpperCase() + maintenanceMachine.type.slice(1)} {maintenanceMachine.name}
              </Text>
            )}
            <Text style={styles.maintenanceLabel}>Describe the issue:</Text>
            <TextInput
              style={styles.maintenanceNotesInput}
              value={maintenanceNotes}
              onChangeText={setMaintenanceNotes}
              placeholder="e.g., Door won't close, water leak, coin jammed..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.maintenanceButtons}>
              <TouchableOpacity
                style={[styles.maintenanceBtn, styles.maintenanceCancelBtn]}
                onPress={() => {
                  setShowMaintenanceModal(false);
                  setMaintenanceMachine(null);
                  setMaintenanceNotes('');
                }}
              >
                <Text style={styles.maintenanceCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.maintenanceBtn, styles.maintenanceSetBtn]}
                onPress={() => handleConfirmMaintenance(false)}
              >
                <Text style={styles.maintenanceSetText}>Set Only</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.maintenanceBtn, styles.maintenancePrintBtn]}
                onPress={() => handleConfirmMaintenance(true)}
                disabled={printingMaintenance}
              >
                {printingMaintenance ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="print" size={16} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.maintenancePrintText}>Set & Print</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Maintenance Camera Modal */}
      <Modal visible={showMaintenanceCamera} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={[styles.cameraHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={closeMaintenanceCamera}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.cameraHeaderTitle}>Take Photo</Text>
            <View style={{ width: 28 }} />
          </View>
          <CameraView
            ref={maintenanceCameraRef}
            style={{ flex: 1 }}
            facing="back"
          />
          <View style={[styles.cameraFooter, { paddingBottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={takeMaintenancePhoto}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </View>
    </KeyboardAvoidingView>
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
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#2563eb',
  },
  modalButtonSecondary: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonSecondaryText: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
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
  activityFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 12,
  },
  activityFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  activityFilterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563eb',
  },
  filterBadge: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 20,
    marginBottom: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 8,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    minWidth: 80,
    alignItems: 'center',
  },
  filterOptionActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    marginTop: 16,
  },
  dropdownContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dropdownChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dropdownChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  dropdownChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  dropdownChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
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
  // Machine filter tabs
  machineFilterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  machineFilterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  machineFilterTabActive: {
    backgroundColor: '#1e293b',
  },
  machineFilterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  machineFilterTabTextActive: {
    color: '#fff',
  },
  machineMaintenanceCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  maintenanceToggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maintenanceToggleActive: {
    backgroundColor: '#ef4444',
  },
  // Driver toggle styles
  driverToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverToggleHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  // Report styles
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reportIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  reportDescription: {
    fontSize: 14,
    color: '#64748b',
  },
  // Machine Grid Styles
  machineGridContent: {
    padding: 16,
  },
  machineGridRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  machineGridItem: {
    width: '23%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    position: 'relative',
  },
  machineGridItemMaintenance: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  machineGridItemInUse: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  machineGridIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  machineGridName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
    textAlign: 'center',
  },
  machineGridQR: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 6,
  },
  machineGridStatus: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  machineGridStatusText: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  machineGridNotes: {
    fontSize: 8,
    color: '#991b1b',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  machineGridMaintenance: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineGridMaintenanceActive: {
    backgroundColor: '#ef4444',
  },
  // Time Clock styles
  timeEntryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  timeEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeEntryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  timeEntryInfo: {
    flex: 1,
  },
  timeEntryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  timeEntryType: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  timeEntryTimeBox: {
    alignItems: 'flex-end',
  },
  timeEntryTime: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  timeEntryDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  timeEntryLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 6,
  },
  timeEntryLocationText: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
  },
  timeEntryPhotoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  timeEntryPhotoText: {
    fontSize: 12,
    color: '#64748b',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  // Time Clock Filter and Group styles
  timeClockFilterBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  userDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  userDropdownText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
  },
  userFilterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  userFilterModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxHeight: '70%',
    overflow: 'hidden',
  },
  userFilterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  userFilterModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  userFilterModalList: {
    maxHeight: 400,
  },
  userFilterModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  userFilterModalItemActive: {
    backgroundColor: '#eff6ff',
  },
  userFilterModalItemText: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
  },
  userFilterModalItemTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  userFilterAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userFilterAvatarText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  timeEntryGroup: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timeEntryGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  timeEntryGroupHeaderLeft: {
    flex: 1,
  },
  timeEntryGroupName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  timeEntryGroupDate: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  timeEntryGroupStats: {
    flexDirection: 'row',
    gap: 12,
  },
  timeEntryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeEntryStatText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeEntryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  timeEntryItemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  timeEntryItemContent: {
    flex: 1,
  },
  timeEntryItemLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  timeEntryItemTime: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  timeEntryItemLocation: {
    fontSize: 11,
    color: '#94a3b8',
    maxWidth: 120,
    marginLeft: 8,
  },
  // Photo Modal styles
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
  },
  photoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  photoModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  photoModalCloseBtn: {
    padding: 4,
  },
  photoModalImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#f1f5f9',
  },
  photoModalDetails: {
    padding: 16,
    gap: 8,
  },
  photoModalName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  photoModalTime: {
    fontSize: 14,
    color: '#64748b',
  },
  photoModalLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  photoModalLocationText: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
  },
  // Maintenance Modal styles
  maintenanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  maintenanceModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  maintenanceModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  maintenanceMachineName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#f59e0b',
    textAlign: 'center',
    marginBottom: 16,
  },
  maintenanceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 8,
  },
  maintenanceNotesInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 16,
    backgroundColor: '#f8fafc',
  },
  maintenanceButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  maintenanceBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  maintenanceCancelBtn: {
    backgroundColor: '#f1f5f9',
  },
  maintenanceCancelText: {
    color: '#64748b',
    fontWeight: '600',
  },
  maintenanceSetBtn: {
    backgroundColor: '#f59e0b',
  },
  maintenanceSetText: {
    color: '#fff',
    fontWeight: '600',
  },
  maintenancePrintBtn: {
    backgroundColor: '#2563eb',
  },
  maintenancePrintText: {
    color: '#fff',
    fontWeight: '600',
  },
  maintenanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  maintenanceCloseBtn: {
    padding: 4,
  },
  // Maintenance photos styles
  maintenancePhotosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  maintenancePhotoWrapper: {
    position: 'relative',
  },
  maintenancePhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  maintenancePhotoRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  maintenanceAddPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maintenanceAddPhotoText: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  // Camera styles
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#000',
  },
  cameraHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  cameraFooter: {
    backgroundColor: '#000',
    paddingTop: 20,
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
  },
});
