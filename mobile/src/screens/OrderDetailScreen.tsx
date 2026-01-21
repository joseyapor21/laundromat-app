import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../services/api';
import { localPrinter } from '../services/LocalPrinter';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAuth } from '../contexts/AuthContext';
import { generateCustomerReceiptText, generateStoreCopyText, generateBagLabelText } from '../services/receiptGenerator';
import type { Order, OrderStatus, MachineAssignment, PaymentMethod, Bag, Settings } from '../types';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
];

type OrderTypeFilter = 'storePickup' | 'delivery';

const STATUS_OPTIONS: { value: OrderStatus; label: string; color: string; orderTypes?: OrderTypeFilter[] }[] = [
  { value: 'new_order', label: 'New Order', color: '#3b82f6' },
  { value: 'received', label: 'Received', color: '#6366f1' },
  { value: 'scheduled_pickup', label: 'Scheduled Pickup', color: '#8b5cf6', orderTypes: ['delivery'] },
  { value: 'picked_up', label: 'Picked Up', color: '#a78bfa', orderTypes: ['delivery'] },
  { value: 'in_washer', label: 'In Washer', color: '#06b6d4' },
  { value: 'in_dryer', label: 'In Dryer', color: '#f97316' },
  { value: 'laid_on_cart', label: 'On Cart', color: '#eab308' },
  { value: 'folding', label: 'Folding', color: '#ec4899' },
  { value: 'folded', label: 'Folded', color: '#f43f5e' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup', color: '#10b981', orderTypes: ['storePickup'] },
  { value: 'ready_for_delivery', label: 'Ready for Delivery', color: '#059669', orderTypes: ['delivery'] },
  { value: 'completed', label: 'Completed', color: '#6b7280' },
];

export default function OrderDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualQRCode, setManualQRCode] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');
  const [checkingMachine, setCheckingMachine] = useState<string | null>(null);
  const [uncheckingMachine, setUncheckingMachine] = useState<string | null>(null);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [verifyingFolding, setVerifyingFolding] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const isProcessingScan = useRef(false);

  const loadOrder = useCallback(async () => {
    try {
      const data = await api.getOrder(route.params.orderId);
      setOrder(data);
      if (data.paymentMethod && data.paymentMethod !== 'pending') {
        setSelectedPaymentMethod(data.paymentMethod);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load order');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [route.params.orderId, navigation]);

  useEffect(() => {
    loadOrder();
    // Load settings for printer IP
    api.getSettings().then(setSettings).catch(console.error);
  }, [loadOrder]);

  // Refresh when screen comes into focus (e.g., after editing)
  useFocusEffect(
    useCallback(() => {
      loadOrder();
    }, [loadOrder])
  );

  // Auto-refresh order every 10 seconds
  useAutoRefresh(loadOrder);

  async function updateStatus(newStatus: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    try {
      await api.updateOrderStatus(order._id, newStatus);
      await loadOrder();
      Alert.alert('Success', `Status updated to ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}`);
    } catch (error) {
      console.error('Status update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update status';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
    }
  }

  function showPrintMenu() {
    setShowPrintOptions(true);
  }

  // Print using local POS thermal printer via TCP with ESC/POS formatting
  async function handlePrint(type: 'customer' | 'store' | 'both') {
    setShowPrintOptions(false);
    if (!order) return;

    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Printer Not Configured', 'Please set the thermal printer IP in Admin Settings.');
      return;
    }

    setPrinting(true);
    try {
      const receipts: string[] = [];
      if (type === 'customer' || type === 'both') {
        receipts.push(generateCustomerReceiptText(order));
      }
      if (type === 'store' || type === 'both') {
        receipts.push(generateStoreCopyText(order));
      }

      for (const content of receipts) {
        const response = await localPrinter.printReceipt(printerIp, content, printerPort);
        if (!response.success) {
          throw new Error(response.error || 'Print failed');
        }
      }
      Alert.alert('Success', `${type === 'both' ? 'Both receipts' : type === 'customer' ? 'Customer receipt' : 'Store copy'} printed!`);
    } catch (error) {
      Alert.alert('Print Error', error instanceof Error ? error.message : 'Failed to print. Check printer IP in admin settings.');
    } finally {
      setPrinting(false);
    }
  }

  async function handlePrintBagLabels() {
    if (!order || !order.bags || order.bags.length === 0) {
      Alert.alert('No Bags', 'No bags to print labels for');
      return;
    }

    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Printer Not Configured', 'Please set the thermal printer IP in Admin Settings.');
      return;
    }

    setPrinting(true);
    try {
      for (let i = 0; i < order.bags.length; i++) {
        const bag = order.bags[i];
        const content = generateBagLabelText(order, bag, i + 1, order.bags.length);
        const response = await localPrinter.printReceipt(printerIp, content, printerPort);
        if (!response.success) {
          throw new Error(response.error || 'Print failed');
        }
      }
      Alert.alert('Success', `Printed ${order.bags.length} bag label(s)`);
    } catch (error) {
      Alert.alert('Print Error', error instanceof Error ? error.message : 'Failed to print. Check printer IP in admin settings.');
    } finally {
      setPrinting(false);
    }
  }

  async function handlePrintSingleBag(bagIndex: number) {
    if (!order || !order.bags || !order.bags[bagIndex]) {
      Alert.alert('Error', 'Bag not found');
      return;
    }

    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Printer Not Configured', 'Please set the thermal printer IP in Admin Settings.');
      return;
    }

    setPrinting(true);
    try {
      const bag = order.bags[bagIndex];
      const content = generateBagLabelText(order, bag, bagIndex + 1, order.bags.length);
      const response = await localPrinter.printReceipt(printerIp, content, printerPort);
      if (!response.success) {
        throw new Error(response.error || 'Print failed');
      }
      Alert.alert('Success', `Bag ${bagIndex + 1} label printed`);
    } catch (error) {
      Alert.alert('Print Error', error instanceof Error ? error.message : 'Failed to print. Check printer IP in admin settings.');
    } finally {
      setPrinting(false);
    }
  }

  // Handle QR scan for machine assignment
  async function handleMachineScan(qrCode: string) {
    // Prevent duplicate scans - the camera fires multiple times quickly
    if (!order || isProcessingScan.current) return;

    isProcessingScan.current = true;
    setShowScanner(false);
    setManualQRCode('');
    setUpdating(true);

    try {
      const result = await api.scanMachine(qrCode, order._id);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error) {
      console.error('Scan error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign machine';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
      // Reset after a short delay to allow the scanner to be opened again
      setTimeout(() => {
        isProcessingScan.current = false;
      }, 1000);
    }
  }

  async function handleReleaseMachine(machineId: string, machineName: string) {
    if (!order) return;

    Alert.alert(
      'Remove Machine',
      `Remove order from ${machineName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              await api.releaseMachine(machineId, order._id);
              Alert.alert('Success', `Order removed from ${machineName}`);
              await loadOrder();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to release machine';
              Alert.alert('Error', errorMessage);
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  }

  async function handleCheckMachine(assignment: MachineAssignment) {
    if (!order) return;

    setCheckingMachine(assignment.machineId);
    try {
      // Get user initials - need at least 2 characters
      let initials = 'XX';
      if (user) {
        const firstInitial = user.firstName?.charAt(0) || '';
        const lastInitial = user.lastName?.charAt(0) || '';
        if (firstInitial && lastInitial) {
          // Both names available - use first letter of each
          initials = `${firstInitial}${lastInitial}`.toUpperCase();
        } else if (firstInitial) {
          // Only first name - use first two letters of first name
          initials = user.firstName.substring(0, 2).toUpperCase();
        }
      }
      const result = await api.checkMachine(order._id, assignment.machineId, initials);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check machine';
      Alert.alert('Error', errorMessage);
    } finally {
      setCheckingMachine(null);
    }
  }

  async function handleUncheckMachine(assignment: MachineAssignment) {
    if (!order) return;

    setUncheckingMachine(assignment.machineId);
    try {
      const result = await api.uncheckMachine(order._id, assignment.machineId);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to uncheck machine';
      Alert.alert('Error', errorMessage);
    } finally {
      setUncheckingMachine(null);
    }
  }

  async function handlePaymentToggle() {
    if (!order) return;
    setUpdating(true);
    try {
      const updateData = order.isPaid
        ? { isPaid: false, paymentMethod: 'pending' as PaymentMethod }
        : { isPaid: true, paymentMethod: selectedPaymentMethod };

      await api.updateOrder(order._id, updateData);
      Alert.alert('Success', order.isPaid ? 'Payment status cleared' : `Order marked as paid (${selectedPaymentMethod})`);
      await loadOrder();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update payment';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
    }
  }

  // Folding Verification (order-level) - Verifies folding and moves to ready status
  async function handleVerifyFolding() {
    if (!order || !user) return;

    // Get user name and initials
    const checkedBy = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';

    // Prevent same person from folding and checking
    if (order.foldedBy && order.foldedBy.toLowerCase() === checkedBy.toLowerCase()) {
      Alert.alert('Not Allowed', 'The same person who marked the order as folded cannot verify it. A different person must check.');
      return;
    }

    let initials = 'XX';
    const firstInitial = user.firstName?.charAt(0) || '';
    const lastInitial = user.lastName?.charAt(0) || '';
    if (firstInitial && lastInitial) {
      initials = `${firstInitial}${lastInitial}`.toUpperCase();
    } else if (firstInitial) {
      initials = user.firstName.substring(0, 2).toUpperCase();
    }

    setVerifyingFolding(true);
    try {
      const result = await api.verifyFoldingComplete(order._id, checkedBy, initials);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to verify folding';
      Alert.alert('Error', errorMessage);
    } finally {
      setVerifyingFolding(false);
    }
  }

  function openScanner() {
    // Reset the scan lock when opening scanner
    isProcessingScan.current = false;

    if (!permission?.granted) {
      requestPermission().then(result => {
        if (result.granted) {
          setShowScanner(true);
        } else {
          Alert.alert('Permission Required', 'Camera permission is needed to scan QR codes');
        }
      });
    } else {
      setShowScanner(true);
    }
  }

  function formatDate(date: Date | string | undefined | null): string {
    if (!date) return '';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  }

  // Format date like "Tue - Oct 08, 11:45 AM"
  function formatDateNice(date: Date | string | undefined | null): string {
    if (!date) return 'Not set';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'Not set';
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayName = days[d.getDay()];
      const monthName = months[d.getMonth()];
      const dayNum = d.getDate().toString().padStart(2, '0');
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${dayName} - ${monthName} ${dayNum}, ${hours}:${minutes} ${ampm}`;
    } catch {
      return 'Not set';
    }
  }

  // Get active machine assignments (not removed)
  const activeMachines = order?.machineAssignments?.filter(
    (a: MachineAssignment) => !a.removedAt
  ) || [];

  // Get all machine assignments for history
  const allMachineAssignments = order?.machineAssignments || [];

  const currentStatusOption = STATUS_OPTIONS.find(s => s.value === order?.status);

  // Workflow logic - determine what sections to show based on order state
  const isDelivery = order?.orderType === 'delivery';

  // Check if bags have weights
  const hasBagWeights = order?.bags && order.bags.length > 0 &&
    order.bags.some(bag => bag.weight && bag.weight > 0);

  // Pre-wash stages (before laundry processing starts)
  const preWashStatuses: OrderStatus[] = ['new_order', 'received', 'scheduled_pickup', 'picked_up'];
  const isPreWashStage = order ? preWashStatuses.includes(order.status) : false;

  // Active washing/processing stages
  const processingStatuses: OrderStatus[] = ['in_washer', 'in_dryer', 'laid_on_cart', 'folding', 'folded'];
  const isProcessingStage = order ? processingStatuses.includes(order.status) : false;

  // Ready/completed stages
  const readyStatuses: OrderStatus[] = ['ready_for_pickup', 'ready_for_delivery', 'completed'];
  const isReadyStage = order ? readyStatuses.includes(order.status) : false;

  // For delivery orders in pre-wash stage without weights, they need to add weights first
  const needsWeightsFirst = isDelivery && isPreWashStage && !hasBagWeights;

  // Can show machine section only if weights are added OR it's in-store order that's past received
  const canShowMachineSection = !needsWeightsFirst && !isReadyStage;

  // Can show print labels only if there are bags with weights
  const canShowPrintLabels = hasBagWeights;

  // Show payment section only for ready/completed stages or when order is paid
  const showPaymentSection = isReadyStage || order?.isPaid;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!order) return null;

  return (
    <>
      <ScrollView style={styles.container} keyboardDismissMode="on-drag">
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Text style={styles.orderId}>Order #{order.orderId}</Text>
            <View style={[styles.statusBadge, { backgroundColor: currentStatusOption?.color || '#94a3b8' }]}>
              <Text style={styles.statusText}>
                {order.status.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.headerBottom}>
            <Text style={styles.totalAmount}>${(order.totalAmount || 0).toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('EditOrder' as never, { orderId: order._id } as never)}
            >
              <Ionicons name="pencil" size={18} color="#fff" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <View style={styles.card}>
            <Text style={styles.customerName}>{order.customerName}</Text>
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
            >
              <Ionicons name="call" size={20} color="#2563eb" />
              <Text style={styles.contactText}>{order.customerPhone}</Text>
            </TouchableOpacity>
            {order.customer?.address && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(order.customer!.address)}`)}
              >
                <Ionicons name="location" size={20} color="#2563eb" />
                <Text style={styles.contactText}>{order.customer.address}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.tagRow}>
              <View style={[styles.tag, { backgroundColor: order.orderType === 'delivery' ? '#8b5cf6' : '#3b82f6' }]}>
                <Text style={styles.tagText}>{order.orderType === 'delivery' ? 'Delivery' : 'In-Store'}</Text>
              </View>
              {order.isSameDay && (
                <View style={[styles.tag, { backgroundColor: '#f59e0b' }]}>
                  <Ionicons name="flash" size={12} color="#fff" />
                  <Text style={styles.tagText}>Same Day</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Action Required - Add Weights First (for delivery orders) */}
        {needsWeightsFirst && (
          <View style={styles.section}>
            <View style={styles.actionRequiredCard}>
              <View style={styles.actionRequiredHeader}>
                <Ionicons name="warning" size={24} color="#d97706" />
                <Text style={styles.actionRequiredTitle}>Add Bag Weights</Text>
              </View>
              <Text style={styles.actionRequiredText}>
                This delivery order needs bag weights before processing. Tap Edit to add weights for each bag.
              </Text>
              <TouchableOpacity
                style={styles.actionRequiredButton}
                onPress={() => navigation.navigate('EditOrder' as never, { orderId: order._id } as never)}
              >
                <Ionicons name="pencil" size={18} color="#fff" />
                <Text style={styles.actionRequiredButtonText}>Edit Order & Add Weights</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Print Actions - Only show bag labels button if weights exist */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Print</Text>
          <View style={styles.printCard}>
            <TouchableOpacity
              style={[styles.printButton, printing && styles.buttonDisabled, canShowPrintLabels && { marginBottom: 10 }]}
              onPress={showPrintMenu}
              disabled={printing}
            >
              <Ionicons name="print" size={20} color="#fff" />
              <Text style={styles.printButtonText}>{printing ? 'Printing...' : 'Print Receipt'}</Text>
              <Ionicons name="chevron-down" size={16} color="#fff" />
            </TouchableOpacity>
            {canShowPrintLabels && (
              <>
                <TouchableOpacity
                  style={[styles.printButton, styles.printButtonPurple, printing && styles.buttonDisabled]}
                  onPress={handlePrintBagLabels}
                  disabled={printing}
                >
                  <Ionicons name="pricetag" size={20} color="#fff" />
                  <Text style={styles.printButtonText}>Print All Bag Labels</Text>
                </TouchableOpacity>
                <View style={styles.bagButtonsContainer}>
                  <Text style={styles.bagButtonsLabel}>Print individual bags:</Text>
                  <View style={styles.bagButtons}>
                    {order.bags?.map((bag, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[styles.bagButton, printing && styles.buttonDisabled]}
                        onPress={() => handlePrintSingleBag(index)}
                        disabled={printing}
                      >
                        <Text style={styles.bagButtonText}>{bag.identifier || `Bag ${index + 1}`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}
            {!canShowPrintLabels && order.bags && order.bags.length > 0 && (
              <Text style={styles.noBagWeightsText}>Add bag weights to print bag labels</Text>
            )}
          </View>
        </View>

        {/* Machine Assignments - Only show if weights are added */}
        {canShowMachineSection && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Washer / Dryer</Text>
              <TouchableOpacity
                style={[styles.scanButton, updating && styles.buttonDisabled]}
                onPress={openScanner}
                disabled={updating}
              >
                <Ionicons name="qr-code" size={16} color="#fff" />
                <Text style={styles.scanButtonText}>Scan QR</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.machineCard}>
              {activeMachines.length === 0 ? (
                <Text style={styles.noMachinesText}>No machines assigned. Tap "Scan QR" to add.</Text>
              ) : (
                activeMachines.map((assignment: MachineAssignment, index: number) => (
                  <View
                    key={index}
                    style={[
                      styles.machineItem,
                      assignment.isChecked && styles.machineItemChecked,
                    ]}
                  >
                    <View style={styles.machineHeader}>
                      <View style={styles.machineInfo}>
                        <View style={[
                          styles.machineIcon,
                          assignment.isChecked
                            ? styles.machineIconChecked
                            : assignment.machineType === 'washer'
                              ? styles.machineIconWasher
                              : styles.machineIconDryer,
                        ]}>
                          {assignment.isChecked ? (
                            <Ionicons name="checkmark" size={20} color="#10b981" />
                          ) : (
                            <Ionicons
                              name={assignment.machineType === 'washer' ? 'water' : 'flame'}
                              size={20}
                              color={assignment.machineType === 'washer' ? '#06b6d4' : '#f97316'}
                            />
                          )}
                        </View>
                        <View>
                          <Text style={styles.machineName}>{assignment.machineName}</Text>
                          <Text style={styles.machineType}>
                            {assignment.machineType}
                            {assignment.isChecked && (
                              <Text style={styles.checkedText}> - Checked by {assignment.checkedByInitials}</Text>
                            )}
                          </Text>
                        </View>
                      </View>
                      {!assignment.isChecked && (
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => handleReleaseMachine(assignment.machineId, assignment.machineName)}
                          disabled={updating}
                        >
                          <Ionicons name="close-circle" size={20} color="#ef4444" />
                          <Text style={styles.removeButtonText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Check/Uncheck section */}
                    <View style={styles.checkSection}>
                      {!assignment.isChecked ? (
                        <>
                          <Text style={styles.checkHint}>When done, another person must verify:</Text>
                          <TouchableOpacity
                            style={[styles.checkButton, checkingMachine === assignment.machineId && styles.buttonDisabled]}
                            onPress={() => handleCheckMachine(assignment)}
                            disabled={checkingMachine === assignment.machineId}
                          >
                            {checkingMachine === assignment.machineId ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Text style={styles.checkButtonText}>Mark as Checked</Text>
                            )}
                          </TouchableOpacity>
                        </>
                      ) : (
                        <View style={styles.checkedInfo}>
                          <Text style={styles.checkedByText}>
                            Checked by: {assignment.checkedBy}
                            {assignment.checkedByInitials && ` (${assignment.checkedByInitials})`}
                            {formatDate(assignment.checkedAt) && ` - ${formatDate(assignment.checkedAt)}`}
                          </Text>
                          <TouchableOpacity
                            style={styles.uncheckButton}
                            onPress={() => handleUncheckMachine(assignment)}
                            disabled={uncheckingMachine === assignment.machineId}
                          >
                            <Text style={styles.uncheckButtonText}>
                              {uncheckingMachine === assignment.machineId ? 'Unchecking...' : 'Uncheck'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {(assignment.assignedBy || assignment.assignedAt) && (
                      <View style={styles.assignedInfo}>
                        <Ionicons name="time-outline" size={12} color="#94a3b8" />
                        <Text style={styles.assignedText}>
                          Added by {assignment.assignedBy} - {formatDate(assignment.assignedAt)}
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Machine History - Only show if there's history and we can show machine section */}
        {canShowMachineSection && allMachineAssignments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Machine History</Text>
            <View style={styles.historyCard}>
              {allMachineAssignments
                .sort((a: MachineAssignment, b: MachineAssignment) =>
                  new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
                )
                .map((assignment: MachineAssignment, index: number) => (
                  <View
                    key={index}
                    style={[
                      styles.historyItem,
                      assignment.removedAt && styles.historyItemDone,
                      !assignment.removedAt && assignment.isChecked && styles.historyItemChecked,
                    ]}
                  >
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyMachine}>
                        {assignment.machineType === 'washer' ? '🧺' : '🔥'} {assignment.machineName}
                      </Text>
                      <View style={[
                        styles.historyBadge,
                        assignment.removedAt
                          ? styles.historyBadgeDone
                          : assignment.isChecked
                            ? styles.historyBadgeChecked
                            : styles.historyBadgePending,
                      ]}>
                        <Text style={styles.historyBadgeText}>
                          {assignment.removedAt ? 'Done' : assignment.isChecked ? 'Checked' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historyDetail}>
                      Assigned by {assignment.assignedBy || 'Unknown'} - {formatDate(assignment.assignedAt)}
                    </Text>
                    {assignment.isChecked && assignment.checkedBy && (
                      <Text style={styles.historyDetail}>
                        Checked by {assignment.checkedBy} - {formatDate(assignment.checkedAt)}
                      </Text>
                    )}
                    {assignment.removedAt && (
                      <Text style={styles.historyDetail}>
                        Removed: {formatDate(assignment.removedAt)}
                      </Text>
                    )}
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Status Update - Show relevant statuses based on workflow */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Process Status</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS
              .filter(option => {
                // If no orderTypes specified, show for all order types
                if (!option.orderTypes) return true;
                // Filter based on order type
                const orderTypeKey = order.orderType === 'delivery' ? 'delivery' : 'storePickup';
                return option.orderTypes.includes(orderTypeKey);
              })
              .map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.statusButton,
                  order.status === option.value && { backgroundColor: option.color },
                ]}
                onPress={() => updateStatus(option.value)}
                disabled={updating || order.status === option.value}
              >
                <Text style={[
                  styles.statusButtonText,
                  order.status === option.value && styles.statusButtonTextActive,
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Mark Folding Complete - Show only when status is 'folded' and not yet verified */}
        {order.status === 'folded' && !order.foldingCheckedBy && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verify Folding</Text>
            <View style={styles.verifyFoldingCard}>
              <View style={styles.verifyFoldingHeader}>
                <Ionicons name="shirt" size={24} color="#ec4899" />
                <Text style={styles.verifyFoldingTitle}>Folding Complete?</Text>
              </View>
              <Text style={styles.verifyFoldingText}>
                Verify that all {order.bags?.length || 0} bag(s) have been folded correctly.
                This will move the order to {order.orderType === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}.
              </Text>
              <TouchableOpacity
                style={[styles.verifyFoldingButton, verifyingFolding && styles.buttonDisabled]}
                onPress={handleVerifyFolding}
                disabled={verifyingFolding || !user}
              >
                {verifyingFolding ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#fff" />
                    <Text style={styles.verifyFoldingButtonText}>
                      Mark Folding Complete
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Folding Progress - Show when order has folding tracking info */}
        {(order.foldingStartedBy || order.foldedBy) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Folding Progress</Text>
            <View style={styles.foldingProgressCard}>
              {/* Started Folding */}
              {order.foldingStartedBy && (
                <View style={styles.foldingStep}>
                  <View style={[styles.foldingStepIcon, styles.foldingStepIconActive]}>
                    <Ionicons name="shirt" size={18} color="#ec4899" />
                  </View>
                  <View style={styles.foldingStepContent}>
                    <Text style={styles.foldingStepTitle}>Started Folding</Text>
                    <Text style={styles.foldingStepBy}>
                      {order.foldingStartedByInitials || order.foldingStartedBy}
                      {order.foldingStartedAt && ` - ${formatDate(order.foldingStartedAt)}`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Finished Folding */}
              {order.foldedBy && (
                <View style={styles.foldingStep}>
                  <View style={[styles.foldingStepIcon, styles.foldingStepIconComplete]}>
                    <Ionicons name="checkmark-done" size={18} color="#10b981" />
                  </View>
                  <View style={styles.foldingStepContent}>
                    <Text style={styles.foldingStepTitle}>Finished Folding</Text>
                    <Text style={styles.foldingStepBy}>
                      {order.foldedByInitials || order.foldedBy}
                      {order.foldedAt && ` - ${formatDate(order.foldedAt)}`}
                    </Text>
                  </View>
                </View>
              )}

              {/* Folding Check (verification) */}
              {order.foldingCheckedBy && (
                <View style={styles.foldingStep}>
                  <View style={[styles.foldingStepIcon, styles.foldingStepIconVerified]}>
                    <Ionicons name="shield-checkmark" size={18} color="#2563eb" />
                  </View>
                  <View style={styles.foldingStepContent}>
                    <Text style={styles.foldingStepTitle}>Verified & Ready</Text>
                    <Text style={styles.foldingStepBy}>
                      {order.foldingCheckedByInitials || order.foldingCheckedBy}
                      {order.foldingCheckedAt && ` - ${formatDate(order.foldingCheckedAt)}`}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Order Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Details</Text>
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Type</Text>
              <Text style={styles.detailValue}>
                {order.orderType === 'delivery' ? 'Pickup & Delivery' : 'In-Store'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Weight</Text>
              <Text style={styles.detailValue}>{order.weight || 0} lbs</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bags</Text>
              <Text style={styles.detailValue}>{order.bags?.length || 0}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Created</Text>
              <Text style={styles.detailValue}>
                {formatDateNice(order.dropOffDate)}
              </Text>
            </View>
            {order.estimatedPickupDate && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{order.orderType === 'delivery' ? 'Pickup' : 'Ready by'}</Text>
                <Text style={styles.detailValue}>
                  {formatDateNice(order.estimatedPickupDate)}
                </Text>
              </View>
            )}
            {order.orderType === 'delivery' && order.deliverySchedule && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Delivery by</Text>
                <Text style={styles.detailValue}>
                  {formatDateNice(order.deliverySchedule)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bags Details */}
        {order.bags && order.bags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bags ({order.bags.length})</Text>
            <View style={styles.bagsContainer}>
              {order.bags.map((bag, index) => (
                <View key={index} style={styles.bagDetailCard}>
                  <View style={styles.bagDetailHeader}>
                    <View style={styles.bagNameRow}>
                      <Ionicons name="bag-handle" size={18} color="#8b5cf6" />
                      <Text style={styles.bagDetailName}>
                        {bag.identifier || `Bag ${index + 1}`}
                      </Text>
                    </View>
                    <Text style={styles.bagDetailWeight}>
                      {bag.weight ? `${bag.weight} lbs` : 'No weight'}
                    </Text>
                  </View>
                  {bag.color && (
                    <View style={styles.bagDetailRow}>
                      <Ionicons name="color-palette-outline" size={14} color="#64748b" />
                      <Text style={styles.bagDetailText}>Color: {bag.color}</Text>
                    </View>
                  )}
                  {bag.description && (
                    <View style={styles.bagInstructionsBox}>
                      <Ionicons name="document-text-outline" size={14} color="#d97706" />
                      <Text style={styles.bagInstructionsText}>{bag.description}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.card}>
            {order.items?.map((item, index) => (
              <View key={index} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.serviceName}</Text>
                <Text style={styles.itemPrice}>${item.total.toFixed(2)}</Text>
              </View>
            ))}
            {order.extraItems && order.extraItems.length > 0 && (
              <View style={styles.extraItemsSection}>
                <Text style={styles.extraItemsLabel}>Extra Items</Text>
                {order.extraItems.map((item: any, index) => {
                  const itemName = item.name || item.item?.name || 'Extra Item';
                  return (
                    <View key={`extra-${index}`} style={styles.itemRow}>
                      <Text style={styles.itemName}>{itemName} x{item.quantity}</Text>
                      <Text style={styles.itemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${(order.totalAmount || 0).toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Notes - Customer notes and special instructions */}
        {(order.specialInstructions || order.customer?.notes) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Instructions</Text>
            <View style={styles.notesCard}>
              {order.customer?.notes && (
                <View style={styles.customerNotesRow}>
                  <Ionicons name="person-circle-outline" size={16} color="#8b5cf6" />
                  <Text style={[styles.notesText, styles.customerNotesText]}>{order.customer.notes}</Text>
                </View>
              )}
              {order.specialInstructions && order.customer?.notes && order.specialInstructions !== order.customer.notes && (
                <View style={styles.divider} />
              )}
              {order.specialInstructions && order.specialInstructions !== order.customer?.notes && (
                <Text style={styles.notesText}>{order.specialInstructions}</Text>
              )}
            </View>
          </View>
        )}

        {/* Payment - Only show for ready/completed orders or if already paid */}
        {showPaymentSection && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={[styles.paymentCard, order.isPaid && styles.paymentCardPaid]}>
              {order.isPaid ? (
                <View style={styles.paymentPaid}>
                  <View style={styles.paidBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.paidBadgeText}>Paid ({order.paymentMethod || 'cash'})</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unpaidButton}
                    onPress={handlePaymentToggle}
                    disabled={updating}
                  >
                    <Text style={styles.unpaidButtonText}>Mark Unpaid</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.paymentPending}>
                  <View style={styles.paymentMethodPicker}>
                    {PAYMENT_METHODS.map(method => (
                      <TouchableOpacity
                        key={method.value}
                        style={[
                          styles.paymentMethodButton,
                          selectedPaymentMethod === method.value && styles.paymentMethodButtonActive,
                        ]}
                        onPress={() => setSelectedPaymentMethod(method.value)}
                      >
                        <Text style={[
                          styles.paymentMethodText,
                          selectedPaymentMethod === method.value && styles.paymentMethodTextActive,
                        ]}>
                          {method.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.markPaidButton, updating && styles.buttonDisabled]}
                    onPress={handlePaymentToggle}
                    disabled={updating}
                  >
                    <Text style={styles.markPaidButtonText}>Mark Paid</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* QR Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => setShowScanner(false)}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan Machine QR Code</Text>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => handleMachineScan(data)}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderText}>Camera permission required</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.manualEntry}>
            <Text style={styles.manualEntryLabel}>Or enter code manually:</Text>
            <View style={styles.manualEntryRow}>
              <TextInput
                style={styles.manualInput}
                value={manualQRCode}
                onChangeText={setManualQRCode}
                placeholder="Machine QR code..."
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={[styles.manualSubmit, !manualQRCode && styles.buttonDisabled]}
                onPress={() => handleMachineScan(manualQRCode)}
                disabled={!manualQRCode}
              >
                <Text style={styles.manualSubmitText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Print Options Modal */}
      <Modal
        visible={showPrintOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrintOptions(false)}
      >
        <TouchableOpacity
          style={styles.printModalOverlay}
          activeOpacity={1}
          onPress={() => setShowPrintOptions(false)}
        >
          <View style={styles.printModalContent}>
            <Text style={styles.printModalTitle}>Print Receipt</Text>
            <TouchableOpacity
              style={styles.printOptionButton}
              onPress={() => handlePrint('customer')}
            >
              <View style={[styles.printOptionIcon, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="person" size={20} color="#16a34a" />
              </View>
              <View style={styles.printOptionTextContainer}>
                <Text style={styles.printOptionLabel}>Customer Receipt</Text>
                <Text style={styles.printOptionDescription}>For the customer to keep</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.printOptionButton}
              onPress={() => handlePrint('store')}
            >
              <View style={[styles.printOptionIcon, { backgroundColor: '#ffedd5' }]}>
                <Ionicons name="storefront" size={20} color="#ea580c" />
              </View>
              <View style={styles.printOptionTextContainer}>
                <Text style={styles.printOptionLabel}>Store Copy</Text>
                <Text style={styles.printOptionDescription}>For store records</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printOptionButton, styles.printOptionButtonHighlight]}
              onPress={() => handlePrint('both')}
            >
              <View style={[styles.printOptionIcon, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="documents" size={20} color="#2563eb" />
              </View>
              <View style={styles.printOptionTextContainer}>
                <Text style={styles.printOptionLabel}>Both Receipts</Text>
                <Text style={styles.printOptionDescription}>Customer + Store copy</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.printCancelButton}
              onPress={() => setShowPrintOptions(false)}
            >
              <Text style={styles.printCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      </>
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
  headerCard: {
    backgroundColor: '#1e293b',
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderId: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
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
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  contactText: {
    fontSize: 16,
    color: '#2563eb',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Action required section
  actionRequiredCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  actionRequiredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  actionRequiredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400e',
  },
  actionRequiredText: {
    fontSize: 14,
    color: '#78350f',
    marginBottom: 16,
    lineHeight: 20,
  },
  actionRequiredButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f59e0b',
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionRequiredButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Print section
  printCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  printButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  printButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
  },
  printButtonPurple: {
    backgroundColor: '#8b5cf6',
  },
  noBagWeightsText: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 10,
    textAlign: 'center',
  },
  printButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  bagButtonsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#bfdbfe',
  },
  bagButtonsLabel: {
    fontSize: 12,
    color: '#2563eb',
    marginBottom: 8,
  },
  bagButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bagButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  bagButtonText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '500',
  },
  // Machine section
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#06b6d4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  machineCard: {
    backgroundColor: '#ecfeff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#a5f3fc',
  },
  noMachinesText: {
    color: '#0891b2',
    fontSize: 14,
  },
  machineItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#a5f3fc',
  },
  machineItemChecked: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  machineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  machineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  machineIconWasher: {
    backgroundColor: '#cffafe',
  },
  machineIconDryer: {
    backgroundColor: '#ffedd5',
  },
  machineIconChecked: {
    backgroundColor: '#dcfce7',
  },
  machineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  machineType: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  checkedText: {
    color: '#10b981',
  },
  machineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  removeButtonText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '500',
  },
  checkSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  checkHint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  checkButton: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  checkedInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkedByText: {
    fontSize: 12,
    color: '#10b981',
    flex: 1,
  },
  uncheckButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
  },
  uncheckButtonText: {
    color: '#d97706',
    fontSize: 12,
    fontWeight: '500',
  },
  assignedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  assignedText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  // Machine history
  historyCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
  },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyItemDone: {
    backgroundColor: '#f1f5f9',
    opacity: 0.7,
  },
  historyItemChecked: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyMachine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyBadgeDone: {
    backgroundColor: '#e2e8f0',
  },
  historyBadgeChecked: {
    backgroundColor: '#dcfce7',
  },
  historyBadgePending: {
    backgroundColor: '#fef3c7',
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  historyDetail: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  // Status grid
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  statusButtonTextActive: {
    color: '#fff',
  },
  // Details
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  // Bags details
  bagsContainer: {
    gap: 10,
  },
  bagDetailCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  bagDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bagNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bagDetailName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  bagDetailWeight: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  bagDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bagDetailText: {
    fontSize: 14,
    color: '#64748b',
  },
  bagInstructionsBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 8,
  },
  bagInstructionsText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
  },
  // Items
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemName: {
    fontSize: 14,
    color: '#1e293b',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  // Notes
  notesCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
  },
  notesText: {
    fontSize: 14,
    color: '#92400e',
  },
  customerNotesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  customerNotesText: {
    flex: 1,
    color: '#7c3aed',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#fcd34d',
    marginVertical: 10,
  },
  // Payment
  paymentCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  paymentCardPaid: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  paymentPaid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  paidBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  unpaidButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unpaidButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentPending: {},
  paymentMethodPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  paymentMethodButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentMethodButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  paymentMethodText: {
    fontSize: 14,
    color: '#475569',
  },
  paymentMethodTextActive: {
    color: '#fff',
  },
  markPaidButton: {
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  markPaidButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Disabled button
  buttonDisabled: {
    opacity: 0.6,
  },
  // Scanner modal
  scannerContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  camera: {
    flex: 1,
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 20,
    backgroundColor: '#334155',
    borderRadius: 16,
  },
  cameraPlaceholderText: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  manualEntry: {
    padding: 20,
    backgroundColor: '#0f172a',
  },
  manualEntryLabel: {
    color: '#94a3b8',
    marginBottom: 8,
  },
  manualEntryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
  },
  manualSubmit: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    borderRadius: 10,
    justifyContent: 'center',
  },
  manualSubmitText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Print options modal
  printModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  printModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  printModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 16,
  },
  printOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  printOptionButtonHighlight: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  printOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  printOptionTextContainer: {
    flex: 1,
  },
  printOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  printOptionDescription: {
    fontSize: 13,
    color: '#64748b',
  },
  printCancelButton: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  printCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748b',
  },
  extraItemsSection: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    marginTop: 8,
  },
  extraItemsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: 4,
  },
  // Folding progress section
  foldingProgressCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fce7f3',
  },
  foldingStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  foldingStepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  foldingStepIconActive: {
    backgroundColor: '#fce7f3',
  },
  foldingStepIconComplete: {
    backgroundColor: '#dcfce7',
  },
  foldingStepIconVerified: {
    backgroundColor: '#dbeafe',
  },
  foldingStepContent: {
    flex: 1,
  },
  foldingStepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  foldingStepBy: {
    fontSize: 13,
    color: '#64748b',
  },
  // Verify folding section (order-level)
  verifyFoldingCard: {
    backgroundColor: '#fce7f3',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#ec4899',
  },
  verifyFoldingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  verifyFoldingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#831843',
  },
  verifyFoldingText: {
    fontSize: 14,
    color: '#9d174d',
    marginBottom: 16,
    lineHeight: 20,
  },
  verifyFoldingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 10,
  },
  verifyFoldingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
