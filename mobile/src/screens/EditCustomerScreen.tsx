import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { formatPhoneInput, formatPhoneNumber } from '../utils/phoneFormat';
import { localPrinter } from '../services/LocalPrinter';
import { generateCreditBalanceReceipt } from '../services/receiptGenerator';
import AddressInput from '../components/AddressInput';
import type { Customer, CreditTransaction, Order, StatusHistoryEntry, Settings } from '../types';

export default function EditCustomerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [buzzerCode, setBuzzerCode] = useState('');
  const [notes, setNotes] = useState('');

  // Credit
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');
  const [creditPaymentMethod, setCreditPaymentMethod] = useState<'cash' | 'check' | 'venmo' | 'zelle'>('cash');
  const [printing, setPrinting] = useState(false);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Location and settings for printing
  const { currentLocation } = useLocation();
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadCustomer = useCallback(async () => {
    try {
      const data = await api.getCustomer(route.params.customerId);
      setCustomer(data);

      // Populate form
      setName(data.name || '');
      setPhoneNumber(formatPhoneNumber(data.phoneNumber) || '');
      setAddress(data.address || '');
      setEmail(data.email || '');
      setDeliveryFee(data.deliveryFee?.replace('$', '') || '');
      setBuzzerCode(data.buzzerCode || '');
      setNotes(data.notes || '');

      // Load orders
      loadOrders(route.params.customerId);
    } catch (error) {
      Alert.alert('Error', 'Failed to load customer');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [route.params.customerId, navigation]);

  const loadOrders = async (customerId: string) => {
    setLoadingOrders(true);
    try {
      const ordersData = await api.getCustomerOrders(customerId);
      setOrders(ordersData);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  // Load settings for thermal printer
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const fetchedSettings = await api.getSettings();
        setSettings(fetchedSettings);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    setSaving(true);
    try {
      await api.updateCustomer(customer!._id, {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        address: address.trim(),
        email: email.trim() || undefined,
        deliveryFee: deliveryFee ? `$${parseFloat(deliveryFee).toFixed(2)}` : '$0.00',
        buzzerCode: buzzerCode.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      Alert.alert('Success', 'Customer updated successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Failed to update customer:', error);
      Alert.alert('Error', 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCredit = async () => {
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!creditDescription.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    setSaving(true);
    try {
      await api.addCustomerCredit(customer!._id, amount, creditDescription.trim(), creditPaymentMethod);
      Alert.alert('Success', `$${amount.toFixed(2)} credit added (${creditPaymentMethod})`);
      setCreditAmount('');
      setCreditDescription('');
      setCreditPaymentMethod('cash');
      setShowAddCredit(false);
      loadCustomer();
    } catch (error) {
      console.error('Failed to add credit:', error);
      Alert.alert('Error', 'Failed to add credit');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintBalance = async () => {
    if (!customer) return;

    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Error', 'Thermal printer IP not configured. Please set it in Settings.');
      return;
    }

    setPrinting(true);
    try {
      // Generate credit balance receipt
      const receiptContent = generateCreditBalanceReceipt(customer, currentLocation);

      // Print to thermal WiFi printer
      const result = await localPrinter.printReceipt(printerIp, receiptContent, printerPort);

      if (result.success) {
        Alert.alert('Success', 'Credit balance printed');
      } else {
        Alert.alert('Error', result.error || 'Failed to print');
      }
    } catch (error) {
      console.error('Failed to print balance:', error);
      Alert.alert('Error', 'Failed to print balance receipt');
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Customer',
      'Are you sure you want to delete this customer? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.deleteCustomer(customer!._id);
              Alert.alert('Success', 'Customer deleted', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            } catch (error: any) {
              console.error('Failed to delete customer:', error);
              const message = error?.message || 'Failed to delete customer';
              Alert.alert('Error', message);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date | string): string => {
    try {
      const d = new Date(date);
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const day = d.getDate();
      const year = d.getFullYear();
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${weekday}, ${month} ${day}, ${year}, ${time}`;
    } catch {
      return '';
    }
  };

  const formatShortDate = (date: Date | string): string => {
    try {
      const d = new Date(date);
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const day = d.getDate();
      return `${weekday}, ${month} ${day}`;
    } catch {
      return '';
    }
  };

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      new_order: 'New Order',
      received: 'Received',
      in_washer: 'In Washer',
      in_dryer: 'In Dryer',
      folded: 'Folded',
      ready_for_pickup: 'Ready for Pickup',
      ready_for_delivery: 'Ready for Delivery',
      out_for_delivery: 'Out for Delivery',
      delivered: 'Delivered',
      completed: 'Completed',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      new_order: '#f59e0b',
      received: '#3b82f6',
      in_washer: '#06b6d4',
      in_dryer: '#8b5cf6',
      folded: '#ec4899',
      ready_for_pickup: '#10b981',
      ready_for_delivery: '#10b981',
      out_for_delivery: '#f97316',
      delivered: '#22c55e',
      completed: '#22c55e',
    };
    return colors[status] || '#64748b';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!customer) return null;

  return (
    <KeyboardAwareScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      enableOnAndroid={true}
      extraScrollHeight={20}
      keyboardShouldPersistTaps="handled"
      enableAutomaticScroll={true}
    >
        {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Edit Customer</Text>
              <Text style={styles.headerSubtitle}>{customer.name}</Text>
            </View>
            <TouchableOpacity
              style={styles.newOrderButton}
              onPress={() => navigation.navigate('CreateOrder', { newCustomer: customer })}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={styles.newOrderButtonText}>New Order</Text>
            </TouchableOpacity>
          </View>

          {/* Credit Balance */}
          <View style={styles.creditCard}>
            <View style={styles.creditInfo}>
              <Text style={styles.creditLabel}>Store Credit</Text>
              <Text style={[
                styles.creditAmount,
                (customer.credit || 0) > 0 ? styles.creditPositive : styles.creditZero
              ]}>
                ${(customer.credit || 0).toFixed(2)}
              </Text>
            </View>
            <View style={styles.creditActions}>
              <TouchableOpacity
                style={[styles.printBalanceButton, printing && styles.buttonDisabled]}
                onPress={handlePrintBalance}
                disabled={printing}
              >
                {printing ? (
                  <ActivityIndicator color="#10b981" size="small" />
                ) : (
                  <>
                    <Ionicons name="print-outline" size={18} color="#10b981" />
                    <Text style={styles.printBalanceButtonText}>Print</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addCreditButton}
                onPress={() => setShowAddCredit(!showAddCredit)}
              >
                <Ionicons name={showAddCredit ? 'close' : 'add'} size={20} color="#fff" />
                <Text style={styles.addCreditButtonText}>
                  {showAddCredit ? 'Cancel' : 'Add Credit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {showAddCredit && (
            <View style={styles.addCreditSection}>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Amount ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={creditAmount}
                    onChangeText={setCreditAmount}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={styles.input}
                  value={creditDescription}
                  onChangeText={setCreditDescription}
                  placeholder="e.g., Refund, Loyalty bonus"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Method</Text>
                <View style={styles.paymentMethodRow}>
                  {(['cash', 'check', 'venmo', 'zelle'] as const).map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[
                        styles.paymentMethodBtn,
                        creditPaymentMethod === method && styles.paymentMethodBtnActive
                      ]}
                      onPress={() => setCreditPaymentMethod(method)}
                    >
                      <Text style={[
                        styles.paymentMethodText,
                        creditPaymentMethod === method && styles.paymentMethodTextActive
                      ]}>
                        {method.charAt(0).toUpperCase() + method.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TouchableOpacity
                style={[styles.addCreditConfirmButton, saving && styles.buttonDisabled]}
                onPress={handleAddCredit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.addCreditConfirmText}>Add Credit</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Credit History */}
          {customer.creditHistory && customer.creditHistory.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Credit History</Text>
              <View style={styles.historyList}>
                {customer.creditHistory
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 20)
                  .map((tx: CreditTransaction, index: number) => (
                    <View key={index} style={styles.historyItem}>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyDescription}>{tx.description}</Text>
                        <Text style={styles.historyDate}>
                          {formatDate(tx.createdAt)}
                          {(tx.addedBy || tx.createdBy) ? ` · ${tx.addedBy || tx.createdBy}` : ''}
                          {tx.paymentMethod ? ` · ${tx.paymentMethod}` : ''}
                        </Text>
                        {(tx.balanceBefore !== undefined && tx.balanceBefore !== null) && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                            <Text style={{ fontSize: 12, color: '#94a3b8' }}>
                              Balance:
                            </Text>
                            <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>
                              ${tx.balanceBefore.toFixed(2)}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#94a3b8' }}>→</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: tx.type === 'add' ? '#16a34a' : '#dc2626' }}>
                              ${(tx.balanceAfter ?? 0).toFixed(2)}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[
                        styles.historyAmount,
                        tx.type === 'add' ? styles.historyAdd : styles.historyUse
                      ]}>
                        {tx.type === 'add' ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>
          )}

          {/* Order History */}
          <View style={styles.section}>
            <View style={styles.orderHistoryHeader}>
              <Text style={styles.sectionTitle}>Order History</Text>
              <Text style={styles.orderCount}>{orders.length} orders</Text>
            </View>
            {loadingOrders ? (
              <View style={styles.orderLoadingContainer}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.loadingText}>Loading orders...</Text>
              </View>
            ) : orders.length === 0 ? (
              <View style={styles.emptyOrders}>
                <Ionicons name="receipt-outline" size={32} color="#94a3b8" />
                <Text style={styles.emptyOrdersText}>No orders yet</Text>
              </View>
            ) : (
              <View style={styles.ordersList}>
                {orders.map((order) => {
                  const isExpanded = expandedOrderId === order._id;
                  return (
                    <View key={order._id} style={styles.orderCard}>
                      <TouchableOpacity
                        style={styles.orderCardHeader}
                        onPress={() => setExpandedOrderId(isExpanded ? null : order._id)}
                      >
                        <View style={styles.orderMainInfo}>
                          <View style={styles.orderIdRow}>
                            <Text style={styles.orderId}>#{order.orderId}</Text>
                            <View style={[styles.orderStatusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
                              <Text style={[styles.orderStatusText, { color: getStatusColor(order.status) }]}>
                                {getStatusLabel(order.status)}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.orderDate}>
                            {formatShortDate(order.createdAt)} • {order.bags?.length || 0} bag{(order.bags?.length || 0) !== 1 ? 's' : ''} • {order.weight || 0} lbs
                          </Text>
                          <View style={styles.orderPriceRow}>
                            <Text style={styles.orderPrice}>${(order.totalAmount || 0).toFixed(2)}</Text>
                            {order.isPaid ? (
                              <View style={styles.paidBadge}>
                                <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                                <Text style={styles.paidText}>Paid</Text>
                              </View>
                            ) : (
                              <View style={styles.unpaidBadge}>
                                <Ionicons name="alert-circle" size={14} color="#f59e0b" />
                                <Text style={styles.unpaidText}>Unpaid</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="#64748b"
                        />
                      </TouchableOpacity>

                      {/* Expanded Timeline */}
                      {isExpanded && (
                        <View style={styles.orderTimeline}>
                          <Text style={styles.timelineTitle}>Order Timeline</Text>
                          {order.statusHistory && order.statusHistory.length > 0 ? (
                            order.statusHistory
                              .sort((a: StatusHistoryEntry, b: StatusHistoryEntry) =>
                                new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
                              )
                              .map((entry: StatusHistoryEntry, index: number) => (
                                <View key={index} style={styles.timelineEntry}>
                                  <View style={styles.timelineDot}>
                                    <View style={[styles.timelineDotInner, { backgroundColor: getStatusColor(entry.status) }]} />
                                  </View>
                                  <View style={styles.timelineContent}>
                                    <View style={styles.timelineHeader}>
                                      <Text style={styles.timelineStatus}>{getStatusLabel(entry.status)}</Text>
                                      <Text style={styles.timelineDate}>{formatDate(entry.changedAt)}</Text>
                                    </View>
                                    <Text style={styles.timelineUser}>by {entry.changedBy}</Text>
                                    {entry.notes && (
                                      <Text style={styles.timelineNotes}>{entry.notes}</Text>
                                    )}
                                  </View>
                                </View>
                              ))
                          ) : (
                            <Text style={styles.noTimeline}>No status history available</Text>
                          )}

                          {/* Additional Info */}
                          {order.foldedBy && (
                            <View style={styles.additionalInfo}>
                              <Text style={styles.additionalInfoLabel}>Folded by:</Text>
                              <Text style={styles.additionalInfoValue}>
                                {order.foldedBy} ({order.foldedByInitials}) - {formatDate(order.foldedAt!)}
                              </Text>
                            </View>
                          )}
                          {order.foldingCheckedBy && (
                            <View style={styles.additionalInfo}>
                              <Text style={styles.additionalInfoLabel}>Checked by:</Text>
                              <Text style={styles.additionalInfoValue}>
                                {order.foldingCheckedBy} ({order.foldingCheckedByInitials}) - {formatDate(order.foldingCheckedAt!)}
                              </Text>
                            </View>
                          )}

                          {/* View Order Button */}
                          <TouchableOpacity
                            style={styles.viewOrderButton}
                            onPress={() => navigation.navigate('OrderDetail', { orderId: order._id })}
                          >
                            <Text style={styles.viewOrderButtonText}>View Full Order</Text>
                            <Ionicons name="arrow-forward" size={16} color="#2563eb" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Basic Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Customer name"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={(text) => setPhoneNumber(formatPhoneInput(text))}
                  placeholder="(555) 555-5555"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>
          </View>

          {/* Delivery Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Information</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Address</Text>
                <AddressInput
                  value={address}
                  onChange={setAddress}
                  placeholder="Delivery address"
                  onFocusApartment={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd(true);
                    }, 100);
                  }}
                />
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Delivery Fee ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryFee}
                    onChangeText={setDeliveryFee}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Buzzer Code</Text>
                  <TextInput
                    style={styles.input}
                    value={buzzerCode}
                    onChangeText={setBuzzerCode}
                    placeholder="Buzzer code"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: '#fff', minHeight: 100 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Enter each instruction on a new line..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={5}
              scrollEnabled={true}
              textAlignVertical="top"
              blurOnSubmit={false}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd(true);
                }, 300);
              }}
            />
          </View>

          {/* Payment Connections */}
          {(customer.venmoUsername || customer.zelleEmail || customer.zellePhone) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment Connections</Text>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
                {customer.venmoUsername && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: customer.zelleEmail || customer.zellePhone ? 12 : 0 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#e7f5ff', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name="logo-venmo" size={18} color="#008cff" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>Venmo</Text>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>{customer.venmoUsername}</Text>
                    </View>
                  </View>
                )}
                {customer.zelleEmail && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: customer.zellePhone ? 12 : 0 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name="cash" size={18} color="#22c55e" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>Zelle Email</Text>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>{customer.zelleEmail}</Text>
                    </View>
                  </View>
                )}
                {customer.zellePhone && (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Ionicons name="cash" size={18} color="#22c55e" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>Zelle Phone</Text>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#1e293b' }}>{customer.zellePhone}</Text>
                    </View>
                  </View>
                )}
                <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 12, fontStyle: 'italic' }}>
                  Linked via Admin → Payments tab
                </Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsSection}>
            {isAdmin && (
              <TouchableOpacity
                style={[styles.deleteButton, saving && styles.buttonDisabled]}
                onPress={handleDelete}
                disabled={saving}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.deleteButtonText}>Delete Customer</Text>
              </TouchableOpacity>
            )}

            <View style={styles.mainActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => navigation.goBack()}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

    </KeyboardAwareScrollView>
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
  contentContainer: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#1e293b',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  newOrderButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 14,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  creditCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#10b981',
    margin: 16,
    padding: 20,
    borderRadius: 12,
  },
  creditInfo: {},
  creditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printBalanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  printBalanceButtonText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  creditLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
  },
  creditAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  creditPositive: {
    color: '#fff',
  },
  creditZero: {
    color: 'rgba(255,255,255,0.6)',
  },
  addCreditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addCreditButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addCreditSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  addCreditConfirmButton: {
    backgroundColor: '#10b981',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  addCreditConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  paymentMethodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentMethodBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentMethodBtnActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  paymentMethodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  paymentMethodTextActive: {
    color: '#2563eb',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  historyList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyInfo: {
    flex: 1,
  },
  historyDescription: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  historyDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  historyAdd: {
    color: '#10b981',
  },
  historyUse: {
    color: '#ef4444',
  },
  inputGroup: {
    marginBottom: 12,
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
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionsSection: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  mainActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Order History Styles
  orderHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderCount: {
    fontSize: 12,
    color: '#94a3b8',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  orderLoadingContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyOrders: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyOrdersText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  ordersList: {
    gap: 12,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  orderMainInfo: {
    flex: 1,
  },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  orderStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  orderStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderDate: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  orderPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paidText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '500',
  },
  unpaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unpaidText: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '500',
  },
  orderTimeline: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    padding: 14,
    backgroundColor: '#fafafa',
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  timelineEntry: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineDot: {
    width: 24,
    alignItems: 'center',
    paddingTop: 2,
  },
  timelineDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineContent: {
    flex: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  timelineStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  timelineDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  timelineUser: {
    fontSize: 12,
    color: '#64748b',
  },
  timelineNotes: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 2,
  },
  noTimeline: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 12,
  },
  additionalInfo: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 24,
  },
  additionalInfoLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginRight: 4,
  },
  additionalInfoValue: {
    fontSize: 12,
    color: '#1e293b',
    flex: 1,
  },
  viewOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  viewOrderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
});
