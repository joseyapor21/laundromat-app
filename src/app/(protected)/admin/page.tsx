'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { User, Customer, Settings, ExtraItem, ActivityLog, UserRole, Machine, MachineType } from '@/types';
import AddressInput from '@/components/AddressInput';

type TabType = 'users' | 'customers' | 'settings' | 'extra-items' | 'machines' | 'activity' | 'inventory';

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
  lastUpdated?: string;
  lastUpdatedBy?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [loading, setLoading] = useState(false);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [inviteForm, setInviteForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'employee' as UserRole,
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');

  // Settings state
  const [settings, setSettings] = useState<Settings | null>(null);

  // Extra Items state
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [newExtraItem, setNewExtraItem] = useState({
    name: '',
    description: '',
    price: 0,
    minimumPrice: 0,
    unitType: 'lb' as 'lb' | 'item' | 'each' | 'flat',
    perWeightUnit: null as number | null,
    category: 'service' as string,
  });
  const [editingExtraItem, setEditingExtraItem] = useState<ExtraItem | null>(null);

  // Machines state
  const [machines, setMachines] = useState<Machine[]>([]);
  const [newMachine, setNewMachine] = useState({ name: '', type: 'washer' as MachineType, qrCode: '' });
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  // Activity Logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityFilter, setActivityFilter] = useState('all');

  // Gmail Payment Integration state
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; expired: boolean; message: string } | null>(null);
  const [checkingEmails, setCheckingEmails] = useState(false);

  // App Version state
  const [appVersion, setAppVersion] = useState<{
    minVersion: string;
    latestVersion: string;
    updateMessage: string;
    forceUpdate: boolean;
    iosExternalUrl?: string;
    androidExternalUrl?: string;
  } | null>(null);
  const [savingAppVersion, setSavingAppVersion] = useState(false);

  // Inventory state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryCategories, setInventoryCategories] = useState<string[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState('all');
  const [inventorySearch, setInventorySearch] = useState('');
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null);
  const [savingInventory, setSavingInventory] = useState(false);
  const [newInventoryItem, setNewInventoryItem] = useState({
    name: '',
    quantity: 0,
    status: 'good' as StockStatus,
    lowStockThreshold: 2,
    unit: 'items',
    category: 'General',
    notes: '',
    needsOrder: false,
    orderQuantity: 0,
  });

  // Load data on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAllData(); }, []);

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory');
      if (res.ok) {
        const data = await res.json();
        setInventoryItems(data.items || []);
        setInventoryCategories(data.categories || []);
        setLowStockCount(data.lowStockCount || 0);
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [usersRes, customersRes, settingsRes, extraItemsRes, machinesRes, logsRes, appVersionRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/customers'),
        fetch('/api/settings'),
        fetch('/api/extra-items'),
        fetch('/api/machines'),
        fetch('/api/activity-logs?limit=50'),
        fetch('/api/app-version'),
      ]);

      if (usersRes.ok) setUsers(await usersRes.json());
      if (customersRes.ok) setCustomers(await customersRes.json());
      if (machinesRes.ok) setMachines(await machinesRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (extraItemsRes.ok) setExtraItems(await extraItemsRes.json());
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setActivityLogs(logsData.logs || []);
      }
      if (appVersionRes.ok) {
        const appVersionData = await appVersionRes.json();
        setAppVersion({
          minVersion: appVersionData.minVersion || '1.0.0',
          latestVersion: appVersionData.latestVersion || '1.0.0',
          updateMessage: appVersionData.updateMessage || 'A new version is available. Please update to continue.',
          forceUpdate: appVersionData.forceUpdate || false,
          iosExternalUrl: appVersionData.iosExternalUrl || '',
          androidExternalUrl: appVersionData.androidExternalUrl || '',
        });
      }
      // Load inventory in parallel
      await loadInventory();
    } catch (error) {
      console.error('Failed to load admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  // Load Gmail status
  const loadGmailStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/payments/check-emails');
      if (response.ok) {
        const data = await response.json();
        setGmailStatus(data);
      }
    } catch (error) {
      console.error('Failed to load Gmail status:', error);
    }
  }, []);

  useEffect(() => {
    loadGmailStatus();
  }, [loadGmailStatus]);

  // Connect Gmail
  const handleConnectGmail = async () => {
    try {
      const response = await fetch('/api/auth/google');
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || 'Failed to initiate Gmail connection');
        return;
      }
      const data = await response.json();
      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (error) {
      toast.error('Failed to connect Gmail');
    }
  };

  // Check payment emails manually
  const handleCheckPaymentEmails = async () => {
    setCheckingEmails(true);
    try {
      const response = await fetch('/api/payments/check-emails', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        if (data.matched > 0) {
          toast.success(`Found ${data.processed} payments, ${data.matched} matched to orders!`);
        } else if (data.processed > 0) {
          toast.success(`Found ${data.processed} payment emails, none matched to orders`);
        } else {
          toast.success('No new payment emails found');
        }
      } else {
        toast.error(data.message || 'Failed to check emails');
      }
    } catch (error) {
      toast.error('Failed to check payment emails');
    } finally {
      setCheckingEmails(false);
    }
  };

  // Check for Gmail connection success/error from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const gmailSuccess = urlParams.get('gmail_success');
    const gmailError = urlParams.get('gmail_error');

    if (gmailSuccess === 'true') {
      toast.success('Gmail connected successfully!');
      loadGmailStatus();
      // Remove params from URL
      window.history.replaceState({}, '', '/admin');
    } else if (gmailError) {
      toast.error(`Gmail connection failed: ${gmailError}`);
      window.history.replaceState({}, '', '/admin');
    }
  }, [loadGmailStatus]);

  // User Management
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to invite user');
      }

      const result = await response.json();
      toast.success(`User created! Temporary password: ${result.temporaryPassword}`, { duration: 10000 });
      setInviteForm({ email: '', firstName: '', lastName: '', role: 'employee' });

      const usersRes = await fetch('/api/users');
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to invite user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${editingUser._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editingUser.firstName,
          lastName: editingUser.lastName,
          role: editingUser.role,
          isActive: editingUser.isActive,
        }),
      });

      if (!response.ok) throw new Error('Failed to update user');

      toast.success('User updated successfully');
      setEditingUser(null);
      const usersRes = await fetch('/api/users');
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (error) {
      toast.error('Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete user');

      toast.success('User deleted successfully');
      const usersRes = await fetch('/api/users');
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (error) {
      toast.error('Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  // Customer Management
  const handleUpdateCustomer = async () => {
    if (!editingCustomer) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${editingCustomer._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingCustomer),
      });

      if (!response.ok) throw new Error('Failed to update customer');

      toast.success('Customer updated successfully');
      setEditingCustomer(null);
      const customersRes = await fetch('/api/customers');
      if (customersRes.ok) setCustomers(await customersRes.json());
    } catch (error) {
      toast.error('Failed to update customer');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete customer');

      toast.success('Customer deleted successfully');
      const customersRes = await fetch('/api/customers');
      if (customersRes.ok) setCustomers(await customersRes.json());
    } catch (error) {
      toast.error('Failed to delete customer');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCredit = async () => {
    if (!creditCustomer) return;
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/customers/${creditCustomer._id}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          type: 'add',
          description: creditDescription || 'Credit added',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to add credit');

      toast.success(`Added $${amount.toFixed(2)} credit to ${creditCustomer.name}`);
      setCreditCustomer(null);
      setCreditAmount('');
      setCreditDescription('');

      // Refresh customers
      const customersRes = await fetch('/api/customers');
      if (customersRes.ok) setCustomers(await customersRes.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add credit');
    } finally {
      setLoading(false);
    }
  };

  // Settings
  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error('Failed to update settings');

      toast.success('Settings updated successfully');
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  // Update App Version
  const handleUpdateAppVersion = async () => {
    if (!appVersion) return;
    setSavingAppVersion(true);
    try {
      const response = await fetch('/api/app-version', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appVersion),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update app version');
      }

      toast.success('App version settings updated successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update app version');
    } finally {
      setSavingAppVersion(false);
    }
  };

  // Test thermal printer
  const handleTestPrinter = async () => {
    if (!settings?.thermalPrinterIp) {
      toast.error('Please enter a printer IP address first');
      return;
    }

    setLoading(true);
    try {
      const date = new Date().toLocaleString();
      const testContent = `
================================================
              PRINTER TEST
================================================
Date: ${date}
Status: Connected
Printer IP: ${settings.thermalPrinterIp}
Port: 9100
------------------------------------------------
           TEST MESSAGE
------------------------------------------------
This is a test print from your Laundromat app.
If you can read this clearly, your thermal
printer is configured correctly.
------------------------------------------------
         CHARACTER WIDTH TEST
------------------------------------------------
123456789012345678901234567890123456789012345678
================================================
         TEST COMPLETED SUCCESSFULLY
================================================



`;

      const response = await fetch('/api/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: testContent }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Print failed');
      }

      toast.success('Test print sent successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to test printer');
    } finally {
      setLoading(false);
    }
  };

  // Extra Items
  const handleCreateExtraItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/extra-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newExtraItem, isActive: true }),
      });

      if (!response.ok) throw new Error('Failed to create extra item');

      toast.success('Extra item created successfully');
      setNewExtraItem({ name: '', description: '', price: 0, minimumPrice: 0, unitType: 'lb', perWeightUnit: null, category: 'service' });
      const extraItemsRes = await fetch('/api/extra-items');
      if (extraItemsRes.ok) setExtraItems(await extraItemsRes.json());
    } catch (error) {
      toast.error('Failed to create extra item');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateExtraItem = async () => {
    if (!editingExtraItem) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/extra-items/${editingExtraItem._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingExtraItem),
      });

      if (!response.ok) throw new Error('Failed to update extra item');

      toast.success('Extra item updated successfully');
      setEditingExtraItem(null);
      const extraItemsRes = await fetch('/api/extra-items');
      if (extraItemsRes.ok) setExtraItems(await extraItemsRes.json());
    } catch (error) {
      toast.error('Failed to update extra item');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExtraItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/extra-items/${itemId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete extra item');

      toast.success('Extra item deleted successfully');
      const extraItemsRes = await fetch('/api/extra-items');
      if (extraItemsRes.ok) setExtraItems(await extraItemsRes.json());
    } catch (error) {
      toast.error('Failed to delete extra item');
    } finally {
      setLoading(false);
    }
  };

  // Machines
  const handleCreateMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachine.name || !newMachine.qrCode) {
      toast.error('Name and QR code are required');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMachine),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create machine');
      }

      toast.success('Machine created successfully');
      setNewMachine({ name: '', type: 'washer', qrCode: '' });
      const machinesRes = await fetch('/api/machines');
      if (machinesRes.ok) setMachines(await machinesRes.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create machine');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMachine = async () => {
    if (!editingMachine) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/machines/${editingMachine._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMachine),
      });

      if (!response.ok) throw new Error('Failed to update machine');

      toast.success('Machine updated successfully');
      setEditingMachine(null);
      const machinesRes = await fetch('/api/machines');
      if (machinesRes.ok) setMachines(await machinesRes.json());
    } catch (error) {
      toast.error('Failed to update machine');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMachine = async (machineId: string) => {
    if (!confirm('Are you sure you want to delete this machine?')) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/machines/${machineId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete machine');

      toast.success('Machine deleted successfully');
      const machinesRes = await fetch('/api/machines');
      if (machinesRes.ok) setMachines(await machinesRes.json());
    } catch (error) {
      toast.error('Failed to delete machine');
    } finally {
      setLoading(false);
    }
  };

  // Inventory handlers
  const handleAddInventoryItem = async () => {
    if (!newInventoryItem.name.trim()) return toast.error('Item name is required');
    setSavingInventory(true);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newInventoryItem,
          orderQuantity: newInventoryItem.orderQuantity || null,
          notes: newInventoryItem.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add item');
      }
      toast.success('Item added successfully');
      setShowAddInventory(false);
      setNewInventoryItem({ name: '', quantity: 0, status: 'good', lowStockThreshold: 2, unit: 'items', category: 'General', notes: '', needsOrder: false, orderQuantity: 0 });
      await loadInventory();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add item');
    } finally {
      setSavingInventory(false);
    }
  };

  const handleUpdateInventoryItem = async () => {
    if (!editingInventoryItem) return;
    setSavingInventory(true);
    try {
      const res = await fetch(`/api/inventory/${editingInventoryItem._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingInventoryItem),
      });
      if (!res.ok) throw new Error('Failed to update item');
      toast.success('Item updated successfully');
      setEditingInventoryItem(null);
      await loadInventory();
    } catch (error) {
      toast.error('Failed to update item');
    } finally {
      setSavingInventory(false);
    }
  };

  const handleDeleteInventoryItem = async (id: string) => {
    if (!confirm('Delete this inventory item?')) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      toast.success('Item deleted');
      await loadInventory();
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const handleQuickStatusUpdate = async (item: InventoryItem, status: StockStatus) => {
    try {
      const res = await fetch(`/api/inventory/${item._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, needsOrder: status === 'low' || status === 'out' ? true : item.needsOrder }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      await loadInventory();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // Filtered lists
  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.firstName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.lastName.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phoneNumber.includes(customerSearch)
  );

  const filteredLogs = activityFilter === 'all'
    ? activityLogs
    : activityLogs.filter(log => log.action === activityFilter);

  const filteredInventory = inventoryItems.filter(item => {
    if (inventoryCategoryFilter !== 'all' && item.category !== inventoryCategoryFilter) return false;
    if (inventoryStatusFilter !== 'all') {
      if (inventoryStatusFilter === 'needs_order' && !item.needsOrder) return false;
      else if (inventoryStatusFilter !== 'needs_order' && item.status !== inventoryStatusFilter) return false;
    }
    if (inventorySearch.trim()) {
      const s = inventorySearch.toLowerCase();
      return item.name.toLowerCase().includes(s) || item.category?.toLowerCase().includes(s);
    }
    return true;
  });

  const STATUS_LABELS: Record<StockStatus, { label: string; color: string; bg: string }> = {
    full:  { label: 'Full',  color: 'text-green-800',  bg: 'bg-green-100' },
    good:  { label: 'Good',  color: 'text-blue-800',   bg: 'bg-blue-100' },
    half:  { label: 'Half',  color: 'text-yellow-800', bg: 'bg-yellow-100' },
    low:   { label: 'Low',   color: 'text-orange-800', bg: 'bg-orange-100' },
    out:   { label: 'Out',   color: 'text-red-800',    bg: 'bg-red-100' },
  };

  const tabs = [
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'customers', label: 'Customers', icon: '📋' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
    { key: 'extra-items', label: 'Extra Items', icon: '🏷️' },
    { key: 'machines', label: 'Machines', icon: '🧺' },
    { key: 'inventory', label: 'Inventory', icon: '📦', badge: lowStockCount > 0 ? lowStockCount : undefined },
    { key: 'activity', label: 'Activity', icon: '📊' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <h1 className="text-lg md:text-2xl font-bold text-slate-800">Admin</h1>
          <button
            onClick={() => router.push('/')}
            className="px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm bg-slate-100 hover:bg-slate-200 text-gray-900 rounded-lg transition-colors"
          >
            Dashboard
          </button>
        </div>

        {/* Tabs */}
        <div className="px-2 md:px-6 pb-3 md:pb-4 flex gap-1 md:gap-2 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`relative px-2 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-slate-200 hover:border-blue-300'
              }`}
            >
              <span className="md:mr-2">{tab.icon}</span>
              <span className="hidden md:inline">{tab.label}</span>
              {'badge' in tab && tab.badge ? (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-6xl mx-auto">
        {loading && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg shadow-lg">Loading...</div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-blue-800 text-sm">
                <strong>Note:</strong> Users are managed through the shared authentication system.
                Here you can change their role within the Laundromat Department (Admin or Member).
              </p>
            </div>

            {/* Users List */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 border-b pb-2">
                <h2 className="text-lg font-semibold text-gray-900">Users ({users.length})</h2>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500 w-full md:w-64"
                />
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredUsers.map(user => (
                  <div key={user._id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {user.firstName || user.name?.split(' ')[0]} {user.lastName || user.name?.split(' ').slice(1).join(' ')}
                        </div>
                        <div className="text-sm text-gray-600 truncate">{user.email}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role === 'admin' ? 'Admin' : 'Member'}
                        </span>
                        <button
                          onClick={() => setEditingUser(user)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-900 bg-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user._id)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Customers ({customers.length})</h2>
              <input
                type="text"
                placeholder="Search customers..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500 w-full md:w-64"
              />
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {filteredCustomers.map(customer => (
                <div key={customer._id} className="p-3 md:p-4 border border-gray-200 rounded-lg bg-gray-50">
                  {/* Customer Info Row */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{customer.name}</div>
                      <div className="text-sm text-gray-600">{customer.phoneNumber}</div>
                    </div>
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded w-fit">
                      Delivery: {customer.deliveryFee || '$3.00'}
                    </span>
                  </div>

                  {/* Credit Section - Always Visible */}
                  <div className={`p-3 rounded-lg mb-3 ${
                    (customer.credit || 0) > 0
                      ? 'bg-green-100 border-2 border-green-400'
                      : 'bg-gray-100 border border-gray-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-600">Customer Credit</div>
                        <div className={`text-2xl font-bold ${
                          (customer.credit || 0) > 0 ? 'text-green-700' : 'text-gray-400'
                        }`}>
                          ${(customer.credit || 0).toFixed(2)}
                        </div>
                      </div>
                      <button
                        onClick={() => setCreditCustomer(customer)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                      >
                        + Add Credit
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingCustomer(customer)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700 bg-white"
                    >
                      Edit Customer
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(customer._id)}
                      className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && settings && (
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Pricing & Settings</h2>
            <form onSubmit={handleUpdateSettings} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Weight (lbs)</label>
                  <input
                    type="number"
                    value={settings.minimumWeight}
                    onChange={e => setSettings(s => s ? { ...s, minimumWeight: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.minimumPrice}
                    onChange={e => setSettings(s => s ? { ...s, minimumPrice: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price Per Pound ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.pricePerPound}
                    onChange={e => setSettings(s => s ? { ...s, pricePerPound: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Note: Delivery fee is set per customer in the Customers tab.
              </p>

              <h3 className="text-md font-semibold text-gray-800 mt-6 mb-3 border-t pt-4">Same Day Service Settings</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Base Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.sameDayBasePrice ?? 12}
                    onChange={e => setSettings(s => s ? { ...s, sameDayBasePrice: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Base price for weights up to threshold</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Weight Threshold (lbs)</label>
                  <input
                    type="number"
                    step="1"
                    value={settings.sameDayWeightThreshold ?? 7}
                    onChange={e => setSettings(s => s ? { ...s, sameDayWeightThreshold: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Weights up to this get base price</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price Per Pound ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings.sameDayPricePerPound ?? 1.60}
                    onChange={e => setSettings(s => s ? { ...s, sameDayPricePerPound: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Price per lb above threshold</p>
                </div>
              </div>
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>Same Day Pricing:</strong> Up to {settings.sameDayWeightThreshold ?? 7} lbs = <strong>${(settings.sameDayBasePrice ?? 12).toFixed(2)}</strong>.
                  Above {settings.sameDayWeightThreshold ?? 7} lbs = ${(settings.sameDayBasePrice ?? 12).toFixed(2)} + <strong>${(settings.sameDayPricePerPound ?? 1.60).toFixed(2)}/lb</strong> extra.
                </p>
                <p className="text-sm text-amber-800 mt-2">
                  <strong>Example:</strong> 10 lbs = ${(settings.sameDayBasePrice ?? 12).toFixed(2)} + (10 - {settings.sameDayWeightThreshold ?? 7}) × ${(settings.sameDayPricePerPound ?? 1.60).toFixed(2)} =
                  <strong> ${((settings.sameDayBasePrice ?? 12) + (10 - (settings.sameDayWeightThreshold ?? 7)) * (settings.sameDayPricePerPound ?? 1.60)).toFixed(2)}</strong>
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Save Settings
              </button>
            </form>

            {/* Store Location Section */}
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Store Location (for Route Optimization)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Set your store location for driver route optimization. You can get coordinates from Google Maps by right-clicking on your store.
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store Address</label>
                  <input
                    type="text"
                    value={settings.storeAddress || ''}
                    onChange={e => setSettings(s => s ? { ...s, storeAddress: e.target.value } : s)}
                    placeholder="123 Main St, City, State"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={settings.storeLatitude || 40.7128}
                    onChange={e => setSettings(s => s ? { ...s, storeLatitude: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    value={settings.storeLongitude || -74.0060}
                    onChange={e => setSettings(s => s ? { ...s, storeLongitude: parseFloat(e.target.value) || 0 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>How to get coordinates:</strong> Open Google Maps, right-click on your store location, and click the coordinates to copy them.
                  The first number is latitude, the second is longitude.
                </p>
              </div>
              <button
                onClick={handleUpdateSettings}
                disabled={loading}
                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Save Store Location
              </button>
            </div>

            {/* Thermal Printer Settings Section */}
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Thermal Printer Settings
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Configure your network thermal printer with high availability support. Add a backup printer for automatic failover.
              </p>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Printer IP</label>
                  <input
                    type="text"
                    value={settings.thermalPrinterIp || ''}
                    onChange={e => setSettings(s => s ? { ...s, thermalPrinterIp: e.target.value } : s)}
                    placeholder="e.g., 192.168.1.100"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Main thermal printer</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Backup Printer IP</label>
                  <input
                    type="text"
                    value={settings.backupPrinterIp || ''}
                    onChange={e => setSettings(s => s ? { ...s, backupPrinterIp: e.target.value } : s)}
                    placeholder="e.g., 192.168.1.101"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Failover printer (optional)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retry Attempts</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={settings.printRetryAttempts || 3}
                    onChange={e => setSettings(s => s ? { ...s, printRetryAttempts: parseInt(e.target.value) || 3 } : s)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Retries before failover</p>
                </div>
              </div>
              <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-800">
                  <strong>High Availability:</strong> If primary printer fails after retry attempts, the system will automatically try the backup printer.
                </p>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleUpdateSettings}
                  disabled={loading}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  Save Printer Settings
                </button>
                <button
                  onClick={handleTestPrinter}
                  disabled={loading || !settings?.thermalPrinterIp}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  Test Printer
                </button>
              </div>
            </div>

            {/* Gmail Payment Integration Section */}
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                </svg>
                Gmail Payment Integration
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Connect your Gmail to automatically detect Zelle and Venmo payment notifications and match them to orders.
              </p>

              {/* Connection Status */}
              <div className={`p-4 rounded-lg mb-4 ${
                gmailStatus?.connected && !gmailStatus?.expired
                  ? 'bg-green-50 border border-green-200'
                  : gmailStatus?.expired
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      gmailStatus?.connected && !gmailStatus?.expired
                        ? 'bg-green-500'
                        : gmailStatus?.expired
                          ? 'bg-amber-500'
                          : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="font-medium text-gray-900">
                        {gmailStatus?.connected && !gmailStatus?.expired
                          ? 'Gmail Connected'
                          : gmailStatus?.expired
                            ? 'Gmail Token Expired'
                            : 'Gmail Not Connected'}
                      </div>
                      <div className="text-sm text-gray-600">
                        {gmailStatus?.message || 'Connect Gmail to enable automatic payment detection'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectGmail}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      gmailStatus?.connected && !gmailStatus?.expired
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                  >
                    {gmailStatus?.connected ? 'Reconnect' : 'Connect Gmail'}
                  </button>
                </div>
              </div>

              {/* Manual Check Button */}
              {gmailStatus?.connected && !gmailStatus?.expired && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleCheckPaymentEmails}
                    disabled={checkingEmails}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {checkingEmails ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        Checking...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Check for Payments Now
                      </>
                    )}
                  </button>
                  <span className="text-sm text-gray-500">
                    Payments are automatically checked every 5 minutes
                  </span>
                </div>
              )}

              {/* Setup Instructions */}
              {!gmailStatus?.connected && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Setup Instructions</h4>
                  <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                    <li>Create a Google Cloud project and enable Gmail API</li>
                    <li>Create OAuth 2.0 credentials (Web application type)</li>
                    <li>Add redirect URI: <code className="bg-blue-100 px-1 rounded">https://cloud.homation.us/api/auth/google/callback</code></li>
                    <li>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables</li>
                    <li>Click &quot;Connect Gmail&quot; and authorize access</li>
                  </ol>
                </div>
              )}
            </div>

            {/* App Update Management Section */}
            <div className="mt-8 pt-6 border-t-2 border-gray-200">
              <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                App Update
              </h3>

              {appVersion && (
                <div className="space-y-4">
                  {/* Force Update Toggle */}
                  <div className={`p-4 rounded-lg border-2 ${appVersion.forceUpdate ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">Force Update</div>
                        <div className="text-sm text-gray-600">
                          {appVersion.forceUpdate ? 'Enabled' : 'Disabled'}
                        </div>
                      </div>
                      <button
                        onClick={() => setAppVersion(v => v ? { ...v, forceUpdate: !v.forceUpdate } : v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          appVersion.forceUpdate ? 'bg-emerald-600' : 'bg-gray-300'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          appVersion.forceUpdate ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Version and URLs */}
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Min Version</label>
                      <input
                        type="text"
                        value={appVersion.minVersion}
                        onChange={e => setAppVersion(v => v ? { ...v, minVersion: e.target.value, latestVersion: e.target.value } : v)}
                        placeholder="1.0.1"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">iOS URL</label>
                      <input
                        type="url"
                        value={appVersion.iosExternalUrl || ''}
                        onChange={e => setAppVersion(v => v ? { ...v, iosExternalUrl: e.target.value } : v)}
                        placeholder="https://loadly.io/..."
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Android URL</label>
                      <input
                        type="url"
                        value={appVersion.androidExternalUrl || ''}
                        onChange={e => setAppVersion(v => v ? { ...v, androidExternalUrl: e.target.value } : v)}
                        placeholder="https://loadly.io/..."
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleUpdateAppVersion}
                    disabled={savingAppVersion}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingAppVersion ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      'Save App Update Settings'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Extra Items Tab */}
        {activeTab === 'extra-items' && (
          <div className="space-y-6">
            {/* Create Extra Item */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Create Extra Item</h2>
              <form onSubmit={handleCreateExtraItem} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={newExtraItem.name}
                      onChange={e => setNewExtraItem(i => ({ ...i, name: e.target.value }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. Separate Clothing"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={newExtraItem.category}
                      onChange={e => setNewExtraItem(i => ({ ...i, category: e.target.value }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="service">Service</option>
                      <option value="product">Product</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
                    <select
                      value={newExtraItem.unitType}
                      onChange={e => setNewExtraItem(i => ({ ...i, unitType: e.target.value as 'lb' | 'item' | 'each' | 'flat' }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="lb">Per Pound (/lb)</option>
                      <option value="item">Per Item</option>
                      <option value="each">Each</option>
                      <option value="flat">Flat Rate</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={newExtraItem.description}
                      onChange={e => setNewExtraItem(i => ({ ...i, description: e.target.value }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                      placeholder="Optional description"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price per Unit ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={newExtraItem.price}
                      onChange={e => setNewExtraItem(i => ({ ...i, price: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                      placeholder="0.20"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {newExtraItem.unitType === 'lb' ? 'Price per pound' :
                       newExtraItem.unitType === 'item' ? 'Price per item' :
                       newExtraItem.unitType === 'each' ? 'Price each' : 'Flat rate price'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newExtraItem.minimumPrice}
                      onChange={e => setNewExtraItem(i => ({ ...i, minimumPrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                      placeholder="3.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">Minimum charge (0 = no minimum)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Per Weight Unit (lbs)</label>
                    <input
                      type="number"
                      placeholder="1"
                      value={newExtraItem.perWeightUnit || ''}
                      onChange={e => setNewExtraItem(i => ({ ...i, perWeightUnit: e.target.value ? parseFloat(e.target.value) : null }))}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">1 = per 1 lb, 15 = per 15 lbs</p>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      Create Item
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Extra Items List */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Extra Items ({extraItems.length})</h2>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {extraItems.map(item => (
                  <div key={item._id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{item.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${item.category === 'product' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {item.category === 'product' ? 'Product' : 'Service'}
                          </span>
                          {!item.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Inactive</span>}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {item.description && <span>{item.description} - </span>}
                          <span className="font-medium text-gray-900">${item.price.toFixed(2)}</span>
                          <span className="text-gray-500">
                            /{item.unitType === 'lb' ? 'lb' : item.unitType === 'item' ? 'item' : item.unitType === 'each' ? 'each' : 'flat'}
                          </span>
                          {(item.minimumPrice ?? 0) > 0 && (
                            <span className="ml-2 text-amber-600 font-medium">(min ${(item.minimumPrice ?? 0).toFixed(2)})</span>
                          )}
                          {item.perWeightUnit && item.perWeightUnit > 1 && (
                            <span className="ml-2 text-purple-600 font-medium">(per {item.perWeightUnit} lbs)</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.perWeightUnit && (
                          <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800">
                            Weight-based
                          </span>
                        )}
                        <span className={`px-2 py-1 text-xs rounded ${item.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {item.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <button
                          onClick={() => setEditingExtraItem(item)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-900 bg-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteExtraItem(item._id)}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Machines Tab */}
        {activeTab === 'machines' && (
          <div className="space-y-6">
            {/* Create Machine */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Add New Machine</h2>
              <form onSubmit={handleCreateMachine} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Washer 1"
                    value={newMachine.name}
                    onChange={e => setNewMachine(m => ({ ...m, name: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newMachine.type}
                    onChange={e => setNewMachine(m => ({ ...m, type: e.target.value as MachineType }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="washer">Washer</option>
                    <option value="dryer">Dryer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">QR Code Value</label>
                  <input
                    type="text"
                    required
                    placeholder="Unique QR code"
                    value={newMachine.qrCode}
                    onChange={e => setNewMachine(m => ({ ...m, qrCode: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add Machine
                  </button>
                </div>
              </form>
            </div>

            {/* Machines List */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">
                Machines ({machines.length})
              </h2>

              {/* Washers */}
              <div className="mb-6">
                <h3 className="text-md font-medium text-cyan-700 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-cyan-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </span>
                  Washers ({machines.filter(m => m.type === 'washer').length})
                </h3>
                <div className="space-y-2">
                  {machines.filter(m => m.type === 'washer').map(machine => (
                    <div key={machine._id} className="p-3 border border-gray-200 rounded-lg bg-cyan-50">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{machine.name}</div>
                          <div className="text-sm text-gray-600 truncate">QR: {machine.qrCode}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded ${
                            machine.status === 'available' ? 'bg-green-100 text-green-800' :
                            machine.status === 'in_use' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {machine.status === 'available' ? 'Available' :
                             machine.status === 'in_use' ? 'In Use' : 'Maintenance'}
                          </span>
                          <button
                            onClick={() => setEditingMachine(machine)}
                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-900 bg-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMachine(machine._id)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {machines.filter(m => m.type === 'washer').length === 0 && (
                    <p className="text-gray-500 text-sm py-2">No washers added yet</p>
                  )}
                </div>
              </div>

              {/* Dryers */}
              <div>
                <h3 className="text-md font-medium text-orange-700 mb-3 flex items-center gap-2">
                  <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    </svg>
                  </span>
                  Dryers ({machines.filter(m => m.type === 'dryer').length})
                </h3>
                <div className="space-y-2">
                  {machines.filter(m => m.type === 'dryer').map(machine => (
                    <div key={machine._id} className="p-3 border border-gray-200 rounded-lg bg-orange-50">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{machine.name}</div>
                          <div className="text-sm text-gray-600 truncate">QR: {machine.qrCode}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded ${
                            machine.status === 'available' ? 'bg-green-100 text-green-800' :
                            machine.status === 'in_use' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {machine.status === 'available' ? 'Available' :
                             machine.status === 'in_use' ? 'In Use' : 'Maintenance'}
                          </span>
                          <button
                            onClick={() => setEditingMachine(machine)}
                            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-900 bg-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMachine(machine._id)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {machines.filter(m => m.type === 'dryer').length === 0 && (
                    <p className="text-gray-500 text-sm py-2">No dryers added yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                <div className="text-2xl font-bold text-slate-800">{inventoryItems.length}</div>
                <div className="text-sm text-slate-500 mt-1">Total Items</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                <div className="text-2xl font-bold text-green-600">
                  {inventoryItems.filter(i => i.status === 'full' || i.status === 'good').length}
                </div>
                <div className="text-sm text-slate-500 mt-1">Well Stocked</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-orange-200">
                <div className="text-2xl font-bold text-orange-600">
                  {inventoryItems.filter(i => i.status === 'low').length}
                </div>
                <div className="text-sm text-slate-500 mt-1">Low Stock</div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-red-200">
                <div className="text-2xl font-bold text-red-600">
                  {inventoryItems.filter(i => i.status === 'out').length}
                </div>
                <div className="text-sm text-slate-500 mt-1">Out of Stock</div>
              </div>
            </div>

            {/* Needs Order Banner */}
            {inventoryItems.filter(i => i.needsOrder).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                <span className="text-2xl">🛒</span>
                <div>
                  <div className="font-semibold text-amber-800">
                    {inventoryItems.filter(i => i.needsOrder).length} item{inventoryItems.filter(i => i.needsOrder).length !== 1 ? 's' : ''} need to be ordered
                  </div>
                  <div className="text-sm text-amber-700">
                    {inventoryItems.filter(i => i.needsOrder).map(i => i.name).join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => setInventoryStatusFilter('needs_order')}
                  className="ml-auto px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  View
                </button>
              </div>
            )}

            {/* Controls */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {/* Category Filter */}
                  <select
                    value={inventoryCategoryFilter}
                    onChange={e => setInventoryCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Categories</option>
                    {inventoryCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {/* Status Filter */}
                  <select
                    value={inventoryStatusFilter}
                    onChange={e => setInventoryStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="full">Full</option>
                    <option value="good">Good</option>
                    <option value="half">Half</option>
                    <option value="low">Low</option>
                    <option value="out">Out</option>
                    <option value="needs_order">Needs Order</option>
                  </select>
                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={inventorySearch}
                    onChange={e => setInventorySearch(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500 w-40"
                  />
                  {(inventoryCategoryFilter !== 'all' || inventoryStatusFilter !== 'all' || inventorySearch) && (
                    <button
                      onClick={() => { setInventoryCategoryFilter('all'); setInventoryStatusFilter('all'); setInventorySearch(''); }}
                      className="px-3 py-1.5 text-sm text-gray-600 border border-slate-200 rounded-lg hover:bg-slate-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowAddInventory(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  + Add Item
                </button>
              </div>
            </div>

            {/* Items Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {filteredInventory.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <div className="text-4xl mb-3">📦</div>
                  <div className="font-medium">No inventory items found</div>
                  <button
                    onClick={() => setShowAddInventory(true)}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Add First Item
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Category</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Order</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInventory.map(item => {
                        const st = STATUS_LABELS[item.status];
                        return (
                          <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{item.name}</div>
                              {item.notes && <div className="text-xs text-slate-500 mt-0.5">{item.notes}</div>}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <span className="text-sm text-slate-600">{item.category}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-slate-900">{item.quantity} {item.unit}</span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.status}
                                onChange={e => handleQuickStatusUpdate(item, e.target.value as StockStatus)}
                                className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer ${st.bg} ${st.color} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                              >
                                <option value="full">Full</option>
                                <option value="good">Good</option>
                                <option value="half">Half</option>
                                <option value="low">Low</option>
                                <option value="out">Out</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              {item.needsOrder && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                                  🛒 {item.orderQuantity ? `×${item.orderQuantity}` : 'Yes'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => setEditingInventoryItem({ ...item })}
                                  className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteInventoryItem(item._id)}
                                  className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity Logs Tab */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-900">Activity Logs</h2>
              <select
                value={activityFilter}
                onChange={e => setActivityFilter(e.target.value)}
                className="px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500 w-full md:w-auto"
              >
                <option value="all">All Actions</option>
                <option value="login">Logins</option>
                <option value="create_order">Orders Created</option>
                <option value="update_order">Orders Updated</option>
                <option value="status_change">Status Changes</option>
                <option value="payment_update">Payment Updates</option>
                <option value="assign_washer">Washer Assignments</option>
                <option value="assign_dryer">Dryer Assignments</option>
                <option value="release_machine">Machine Releases</option>
              </select>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No activity logs found</div>
              ) : (
                filteredLogs.map(log => (
                  <div key={log._id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{log.userName}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">{log.details}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Action: {log.action.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={editingUser.firstName}
                  onChange={e => setEditingUser(u => u ? { ...u, firstName: e.target.value } : u)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={editingUser.lastName}
                  onChange={e => setEditingUser(u => u ? { ...u, lastName: e.target.value } : u)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department Role</label>
                <select
                  value={editingUser.role}
                  onChange={e => setEditingUser(u => u ? { ...u, role: e.target.value as UserRole } : u)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="user">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Admins can manage users and settings</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUser}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingCustomer(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Customer</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editingCustomer.name}
                  onChange={e => setEditingCustomer(c => c ? { ...c, name: e.target.value } : c)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editingCustomer.phoneNumber}
                  onChange={e => setEditingCustomer(c => c ? { ...c, phoneNumber: e.target.value } : c)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <AddressInput
                  value={editingCustomer.address}
                  onChange={(address) => setEditingCustomer(c => c ? { ...c, address } : c)}
                  placeholder="Enter delivery address..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Fee</label>
                <input
                  type="text"
                  value={editingCustomer.deliveryFee}
                  onChange={e => setEditingCustomer(c => c ? { ...c, deliveryFee: e.target.value } : c)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingCustomer(null)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCustomer}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Credit Modal */}
      {creditCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setCreditCustomer(null); setCreditAmount(''); setCreditDescription(''); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Add Credit</h2>
            <p className="text-gray-600 mb-4">Adding credit to: <span className="font-medium">{creditCustomer.name}</span></p>

            {/* Current Balance */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <div className="text-sm text-green-700">Current Balance</div>
              <div className="text-2xl font-bold text-green-800">${(creditCustomer.credit || 0).toFixed(2)}</div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Add ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={creditAmount}
                  onChange={e => setCreditAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-green-500 text-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={creditDescription}
                  onChange={e => setCreditDescription(e.target.value)}
                  placeholder="e.g., Payment overage, refund, etc."
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-green-500"
                />
              </div>
            </div>

            {/* Preview new balance */}
            {creditAmount && parseFloat(creditAmount) > 0 && (
              <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                <div className="text-sm text-gray-600">New Balance will be:</div>
                <div className="text-xl font-bold text-gray-900">
                  ${((creditCustomer.credit || 0) + parseFloat(creditAmount || '0')).toFixed(2)}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setCreditCustomer(null); setCreditAmount(''); setCreditDescription(''); }}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCredit}
                disabled={loading || !creditAmount || parseFloat(creditAmount) <= 0}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Add Credit
              </button>
            </div>

            {/* Credit History */}
            {creditCustomer.creditHistory && creditCustomer.creditHistory.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Credit History</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {creditCustomer.creditHistory
                    .slice()
                    .reverse()
                    .slice(0, 5)
                    .map((tx, idx) => (
                    <div key={idx} className="text-xs flex justify-between items-center p-2 bg-gray-50 rounded">
                      <div>
                        <span className={tx.type === 'add' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {tx.type === 'add' ? '+' : '-'}${tx.amount.toFixed(2)}
                        </span>
                        <span className="text-gray-500 ml-2">{tx.description}</span>
                      </div>
                      <div className="text-gray-400">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Extra Item Modal */}
      {editingExtraItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingExtraItem(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Extra Item</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={editingExtraItem.name}
                    onChange={e => setEditingExtraItem(i => i ? { ...i, name: e.target.value } : i)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={editingExtraItem.category || 'service'}
                    onChange={e => setEditingExtraItem(i => i ? { ...i, category: e.target.value } : i)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="service">Service</option>
                    <option value="product">Product</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editingExtraItem.description}
                  onChange={e => setEditingExtraItem(i => i ? { ...i, description: e.target.value } : i)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
                  <select
                    value={editingExtraItem.unitType || 'lb'}
                    onChange={e => setEditingExtraItem(i => i ? { ...i, unitType: e.target.value as 'lb' | 'item' | 'each' | 'flat' } : i)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="lb">Per Pound (/lb)</option>
                    <option value="item">Per Item</option>
                    <option value="each">Each</option>
                    <option value="flat">Flat Rate</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price per Unit ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingExtraItem.price}
                    onChange={e => setEditingExtraItem(i => i ? { ...i, price: parseFloat(e.target.value) || 0 } : i)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingExtraItem.minimumPrice || 0}
                    onChange={e => setEditingExtraItem(i => i ? { ...i, minimumPrice: parseFloat(e.target.value) || 0 } : i)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">0 = no minimum</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Per Weight Unit (lbs)</label>
                  <input
                    type="number"
                    placeholder="1"
                    value={editingExtraItem.perWeightUnit || ''}
                    onChange={e => setEditingExtraItem(i => i ? { ...i, perWeightUnit: e.target.value ? parseFloat(e.target.value) : undefined } : i)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">1 = per 1 lb</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="itemActive"
                  checked={editingExtraItem.isActive}
                  onChange={e => setEditingExtraItem(i => i ? { ...i, isActive: e.target.checked } : i)}
                  className="w-4 h-4"
                />
                <label htmlFor="itemActive" className="text-sm text-gray-700">Active</label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingExtraItem(null)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateExtraItem}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Machine Modal */}
      {editingMachine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingMachine(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Machine</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editingMachine.name}
                  onChange={e => setEditingMachine(m => m ? { ...m, name: e.target.value } : m)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={editingMachine.type}
                  onChange={e => setEditingMachine(m => m ? { ...m, type: e.target.value as MachineType } : m)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="washer">Washer</option>
                  <option value="dryer">Dryer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">QR Code</label>
                <input
                  type="text"
                  value={editingMachine.qrCode}
                  onChange={e => setEditingMachine(m => m ? { ...m, qrCode: e.target.value } : m)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editingMachine.status}
                  onChange={e => setEditingMachine(m => m ? { ...m, status: e.target.value as 'available' | 'in_use' | 'maintenance' } : m)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingMachine(null)}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateMachine}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add Inventory Item Modal */}
      {showAddInventory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddInventory(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Inventory Item</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={newInventoryItem.name}
                    onChange={e => setNewInventoryItem(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Tide Detergent"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={newInventoryItem.category}
                    onChange={e => setNewInventoryItem(p => ({ ...p, category: e.target.value }))}
                    list="inv-categories"
                    placeholder="e.g. Detergents"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <datalist id="inv-categories">
                    {inventoryCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={newInventoryItem.unit}
                    onChange={e => setNewInventoryItem(p => ({ ...p, unit: e.target.value }))}
                    placeholder="e.g. bottles, boxes"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={newInventoryItem.quantity}
                    onChange={e => setNewInventoryItem(p => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={newInventoryItem.status}
                    onChange={e => setNewInventoryItem(p => ({ ...p, status: e.target.value as StockStatus }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="full">Full</option>
                    <option value="good">Good</option>
                    <option value="half">Half</option>
                    <option value="low">Low</option>
                    <option value="out">Out</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                  <input
                    type="number"
                    min="0"
                    value={newInventoryItem.lowStockThreshold}
                    onChange={e => setNewInventoryItem(p => ({ ...p, lowStockThreshold: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={newInventoryItem.orderQuantity}
                    onChange={e => setNewInventoryItem(p => ({ ...p, orderQuantity: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={newInventoryItem.notes}
                    onChange={e => setNewInventoryItem(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="new-needs-order"
                    checked={newInventoryItem.needsOrder}
                    onChange={e => setNewInventoryItem(p => ({ ...p, needsOrder: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="new-needs-order" className="text-sm font-medium text-gray-700">Mark as needs order</label>
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowAddInventory(false)}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddInventoryItem}
                  disabled={savingInventory}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingInventory ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Inventory Item Modal */}
      {editingInventoryItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingInventoryItem(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Inventory Item</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={editingInventoryItem.name}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, name: e.target.value } : p)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={editingInventoryItem.category}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, category: e.target.value } : p)}
                    list="inv-categories-edit"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <datalist id="inv-categories-edit">
                    {inventoryCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={editingInventoryItem.unit}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, unit: e.target.value } : p)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={editingInventoryItem.quantity}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, quantity: parseFloat(e.target.value) || 0 } : p)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={editingInventoryItem.status}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, status: e.target.value as StockStatus } : p)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="full">Full</option>
                    <option value="good">Good</option>
                    <option value="half">Half</option>
                    <option value="low">Low</option>
                    <option value="out">Out</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                  <input
                    type="number"
                    min="0"
                    value={editingInventoryItem.lowStockThreshold}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, lowStockThreshold: parseInt(e.target.value) || 0 } : p)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={editingInventoryItem.orderQuantity || 0}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, orderQuantity: parseInt(e.target.value) || 0 } : p)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={editingInventoryItem.notes || ''}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, notes: e.target.value } : p)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="edit-needs-order"
                    checked={editingInventoryItem.needsOrder}
                    onChange={e => setEditingInventoryItem(p => p ? { ...p, needsOrder: e.target.checked } : p)}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="edit-needs-order" className="text-sm font-medium text-gray-700">Mark as needs order</label>
                </div>
                {editingInventoryItem.lastUpdatedBy && (
                  <div className="col-span-2 text-xs text-slate-500">
                    Last updated by {editingInventoryItem.lastUpdatedBy}
                    {editingInventoryItem.lastUpdated ? ` on ${new Date(editingInventoryItem.lastUpdated).toLocaleString()}` : ''}
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditingInventoryItem(null)}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-900 bg-white hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateInventoryItem}
                  disabled={savingInventory}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingInventory ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
