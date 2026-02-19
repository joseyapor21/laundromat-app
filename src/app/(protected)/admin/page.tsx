'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { User, Customer, Settings, ExtraItem, ActivityLog, UserRole, Machine, MachineType } from '@/types';
import AddressInput from '@/components/AddressInput';

type TabType = 'users' | 'customers' | 'settings' | 'extra-items' | 'machines' | 'activity';

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
  const [newExtraItem, setNewExtraItem] = useState({ name: '', description: '', price: 0, perWeightUnit: null as number | null });
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

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [usersRes, customersRes, settingsRes, extraItemsRes, machinesRes, logsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/customers'),
        fetch('/api/settings'),
        fetch('/api/extra-items'),
        fetch('/api/machines'),
        fetch('/api/activity-logs?limit=50'),
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
      setNewExtraItem({ name: '', description: '', price: 0, perWeightUnit: null });
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

  const tabs = [
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'customers', label: 'Customers', icon: '📋' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
    { key: 'extra-items', label: 'Extra Items', icon: '🏷️' },
    { key: 'machines', label: 'Machines', icon: '🧺' },
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
              className={`px-2 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-slate-200 hover:border-blue-300'
              }`}
            >
              <span className="md:mr-2">{tab.icon}</span>
              <span className="hidden md:inline">{tab.label}</span>
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
          </div>
        )}

        {/* Extra Items Tab */}
        {activeTab === 'extra-items' && (
          <div className="space-y-6">
            {/* Create Extra Item */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Create Extra Item</h2>
              <form onSubmit={handleCreateExtraItem} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={newExtraItem.name}
                    onChange={e => setNewExtraItem(i => ({ ...i, name: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={newExtraItem.description}
                    onChange={e => setNewExtraItem(i => ({ ...i, description: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newExtraItem.price}
                    onChange={e => setNewExtraItem(i => ({ ...i, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Per Weight (lbs)</label>
                  <input
                    type="number"
                    placeholder="e.g. 15"
                    value={newExtraItem.perWeightUnit || ''}
                    onChange={e => setNewExtraItem(i => ({ ...i, perWeightUnit: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty for per-item pricing</p>
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
              </form>
            </div>

            {/* Extra Items List */}
            <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Extra Items ({extraItems.length})</h2>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {extraItems.map(item => (
                  <div key={item._id} className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{item.name}</div>
                        <div className="text-sm text-gray-600">
                          {item.description} - ${item.price.toFixed(2)}
                          {item.perWeightUnit && <span className="ml-2 text-purple-600 font-medium">(per {item.perWeightUnit} lbs)</span>}
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
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Extra Item</h2>
            <div className="space-y-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editingExtraItem.description}
                  onChange={e => setEditingExtraItem(i => i ? { ...i, description: e.target.value } : i)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingExtraItem.price}
                  onChange={e => setEditingExtraItem(i => i ? { ...i, price: parseFloat(e.target.value) || 0 } : i)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Per Weight (lbs)</label>
                <input
                  type="number"
                  placeholder="Leave empty for per-item pricing"
                  value={editingExtraItem.perWeightUnit || ''}
                  onChange={e => setEditingExtraItem(i => i ? { ...i, perWeightUnit: e.target.value ? parseFloat(e.target.value) : undefined } : i)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-gray-900 bg-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editingExtraItem.perWeightUnit
                    ? `Price of $${editingExtraItem.price.toFixed(2)} applies per ${editingExtraItem.perWeightUnit} lbs`
                    : 'Leave empty for per-item pricing (e.g., comforters)'}
                </p>
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
    </div>
  );
}
