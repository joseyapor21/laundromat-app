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
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ReactNativeZoomableView } from '@openspacelabs/react-native-zoomable-view';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../services/api';
import { localPrinter } from '../services/LocalPrinter';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { generateCustomerReceiptText, generateStoreCopyText, generateBagLabelText, generateCustomerTagText } from '../services/receiptGenerator';
import type { Order, OrderStatus, MachineAssignment, PaymentMethod, Bag, Settings, AirDryItem } from '../types';
import { formatPhoneNumber } from '../utils/phoneFormat';

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
  { value: 'transferred', label: 'Transferred', color: '#0ea5e9' },
  { value: 'transfer_checked', label: 'Transfer Checked', color: '#14b8a6' },
  { value: 'in_dryer', label: 'In Dryer', color: '#f97316' },
  { value: 'on_cart', label: 'On Cart', color: '#eab308' },
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
  const { currentLocation } = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
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
  const [transferring, setTransferring] = useState(false);
  const [verifyingTransfer, setVerifyingTransfer] = useState(false);
  const [doingFinalCheck, setDoingFinalCheck] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const isProcessingScan = useRef(false);

  // Bag picker state for keepSeparated orders
  const [showBagPicker, setShowBagPicker] = useState(false);
  const [pendingQrCode, setPendingQrCode] = useState<string | null>(null);
  const [availableBags, setAvailableBags] = useState<Bag[]>([]);
  const [pendingMachineInfo, setPendingMachineInfo] = useState<{ type: 'washer' | 'dryer'; name: string } | null>(null);
  const [loadingBags, setLoadingBags] = useState(false);

  // Machine verification photo state
  const [showVerificationCamera, setShowVerificationCamera] = useState(false);
  const [pendingMachineForPhoto, setPendingMachineForPhoto] = useState<{ machineId: string; machineName: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const verificationCameraRef = useRef<any>(null);
  const [expandedVerificationPhoto, setExpandedVerificationPhoto] = useState<string | null>(null);

  // Pickup photos
  const [pickupPhotos, setPickupPhotos] = useState<Array<{ photoPath: string; capturedAt: Date; capturedBy: string; capturedByName: string }>>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Air dry items
  const [showAirDryCamera, setShowAirDryCamera] = useState(false);
  const [addingAirDry, setAddingAirDry] = useState(false);
  const [airDryDescription, setAirDryDescription] = useState('');
  const airDryCameraRef = useRef<any>(null);
  const [expandedAirDryPhoto, setExpandedAirDryPhoto] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    try {
      const data = await api.getOrder(route.params.orderId);
      setOrder(data);
      if (data.paymentMethod && data.paymentMethod !== 'pending') {
        setSelectedPaymentMethod(data.paymentMethod);
      }
      // Load pickup photos
      if (data.pickupPhotos && data.pickupPhotos.length > 0) {
        setPickupPhotos(data.pickupPhotos);
      } else {
        setPickupPhotos([]);
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

    // Check if trying to move to folding - all machines must be checked first
    if (newStatus === 'folding' || newStatus === 'on_cart' || newStatus === 'folded') {
      const activeMachinesList = order.machineAssignments?.filter(a => !a.removedAt) || [];
      const uncheckedMachines = activeMachinesList.filter(a => !a.isChecked);

      if (uncheckedMachines.length > 0) {
        const machineNames = uncheckedMachines.map(m => m.machineName).join(', ');
        Alert.alert(
          'Machines Not Checked',
          `The following machines must be checked before moving to ${newStatus}: ${machineNames}`,
          [{ text: 'OK' }]
        );
        return;
      }
    }

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
      // Use latest customer instructions for printing
      const orderForPrint = {
        ...order,
        specialInstructions: order.customer?.notes || order.specialInstructions || '',
      };
      const receipts: string[] = [];
      if (type === 'customer' || type === 'both') {
        receipts.push(generateCustomerReceiptText(orderForPrint, currentLocation));
      }
      if (type === 'store' || type === 'both') {
        receipts.push(generateStoreCopyText(orderForPrint, currentLocation));
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

  async function handlePrintCustomerTag() {
    if (!order) {
      Alert.alert('Error', 'No order to print tag for');
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
      // Use latest customer instructions for printing
      const orderForPrint = {
        ...order,
        specialInstructions: order.customer?.notes || order.specialInstructions || '',
      };
      const content = generateCustomerTagText(orderForPrint);
      const response = await localPrinter.printReceipt(printerIp, content, printerPort);
      if (!response.success) {
        throw new Error(response.error || 'Print failed');
      }
      Alert.alert('Success', 'Customer tag printed');
    } catch (error) {
      Alert.alert('Print Error', error instanceof Error ? error.message : 'Failed to print. Check printer IP in admin settings.');
    } finally {
      setPrinting(false);
    }
  }

  // Print individual bag labels - shows selection if multiple bags
  async function handlePrintBagLabels() {
    if (!order) {
      Alert.alert('Error', 'No order to print bag labels for');
      return;
    }

    if (!order.bags || order.bags.length === 0) {
      Alert.alert('No Bags', 'This order has no bags to print labels for.');
      return;
    }

    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Printer Not Configured', 'Please set the thermal printer IP in Admin Settings.');
      return;
    }

    // If only one bag, print directly
    if (order.bags.length === 1) {
      await printBagLabel(0);
      return;
    }

    // Show selection options for multiple bags
    const buttons = order.bags.map((bag, index) => ({
      text: `Bag ${index + 1}: ${bag.identifier}${bag.weight ? ` (${bag.weight} lb)` : ''}`,
      onPress: () => printBagLabel(index),
    }));

    buttons.push({
      text: 'Print All Bags',
      onPress: () => printAllBagLabels(),
    });

    buttons.push({
      text: 'Cancel',
      onPress: () => {},
    });

    Alert.alert('Select Bag to Print', 'Choose which bag label to print:', buttons);
  }

  // Print a single bag label
  async function printBagLabel(bagIndex: number) {
    if (!order || !order.bags || bagIndex >= order.bags.length) return;

    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;
    if (!printerIp) return;

    setPrinting(true);
    try {
      const orderForPrint = {
        ...order,
        specialInstructions: order.customer?.notes || order.specialInstructions || '',
      };

      const bag = order.bags[bagIndex];
      const totalBags = order.bags.length;
      const content = generateBagLabelText(orderForPrint, bag, bagIndex + 1, totalBags);
      const response = await localPrinter.printReceipt(printerIp, content, printerPort);

      if (!response.success) {
        throw new Error(response.error || `Failed to print bag ${bagIndex + 1}`);
      }
      Alert.alert('Success', `Printed label for Bag ${bagIndex + 1}`);
    } catch (error) {
      Alert.alert('Print Error', error instanceof Error ? error.message : 'Failed to print bag label.');
    } finally {
      setPrinting(false);
    }
  }

  // Print all bag labels
  async function printAllBagLabels() {
    if (!order || !order.bags) return;

    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;
    if (!printerIp) return;

    setPrinting(true);
    try {
      const orderForPrint = {
        ...order,
        specialInstructions: order.customer?.notes || order.specialInstructions || '',
      };

      const totalBags = order.bags.length;
      for (let i = 0; i < totalBags; i++) {
        const bag = order.bags[i];
        const content = generateBagLabelText(orderForPrint, bag, i + 1, totalBags);
        const response = await localPrinter.printReceipt(printerIp, content, printerPort);
        if (!response.success) {
          throw new Error(response.error || `Failed to print bag ${i + 1}`);
        }
      }
      Alert.alert('Success', `Printed ${totalBags} bag label(s)`);
    } catch (error) {
      Alert.alert('Print Error', error instanceof Error ? error.message : 'Failed to print bag labels.');
    } finally {
      setPrinting(false);
    }
  }

  // Handle QR scan for machine assignment
  async function handleMachineScan(qrCode: string, bagIdentifier?: string) {
    // Prevent duplicate scans - the camera fires multiple times quickly
    if (!order || isProcessingScan.current) return;

    isProcessingScan.current = true;
    setShowScanner(false);
    setManualQRCode('');
    setUpdating(true);

    try {
      const result = await api.scanMachine(qrCode, order._id, bagIdentifier);

      // Check if bag selection is required (for keepSeparated orders)
      if (result.requireBagSelection && result.machineType && result.machineName) {
        // Store the QR code and machine info, then fetch available bags
        setPendingQrCode(qrCode);
        setPendingMachineInfo({ type: result.machineType, name: result.machineName });
        setLoadingBags(true);
        setShowBagPicker(true);

        try {
          const bags = await api.getAvailableBags(order._id, result.machineType);
          setAvailableBags(bags);
        } catch (bagError) {
          console.error('Error fetching bags:', bagError);
          Alert.alert('Error', 'Failed to load available bags');
          setShowBagPicker(false);
        } finally {
          setLoadingBags(false);
        }

        isProcessingScan.current = false;
        setUpdating(false);
        return;
      }

      await loadOrder();

      // Prompt to take verification photo
      Alert.alert(
        'Machine Assigned',
        `${result.message}\n\nTake a photo of the machine settings to verify?`,
        [
          {
            text: 'Skip',
            style: 'cancel',
            onPress: () => {
              isProcessingScan.current = false;
            },
          },
          {
            text: 'Take Photo',
            onPress: () => {
              setPendingMachineForPhoto({
                machineId: result.machine._id,
                machineName: result.machine.name,
              });
              setShowVerificationCamera(true);
              isProcessingScan.current = false;
            },
          },
        ]
      );
    } catch (error) {
      console.error('Scan error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign machine';
      Alert.alert('Error', errorMessage);
      isProcessingScan.current = false;
    } finally {
      setUpdating(false);
    }
  }

  // Handle bag selection for keepSeparated orders
  async function handleBagSelected(bag: Bag) {
    if (!pendingQrCode || !order) return;

    setShowBagPicker(false);
    setUpdating(true);

    try {
      const result = await api.scanMachine(pendingQrCode, order._id, bag.identifier);
      await loadOrder();

      // Prompt to take verification photo
      Alert.alert(
        'Machine Assigned',
        `${bag.identifier} assigned to ${result.machine.name}\n\nTake a photo of the machine settings to verify?`,
        [
          {
            text: 'Skip',
            style: 'cancel',
          },
          {
            text: 'Take Photo',
            onPress: () => {
              setPendingMachineForPhoto({
                machineId: result.machine._id,
                machineName: result.machine.name,
              });
              setShowVerificationCamera(true);
            },
          },
        ]
      );
    } catch (error) {
      console.error('Bag assignment error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign machine';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
      setPendingQrCode(null);
      setPendingMachineInfo(null);
      setAvailableBags([]);
    }
  }

  // Capture verification photo for machine
  async function captureVerificationPhoto() {
    if (!verificationCameraRef.current || !pendingMachineForPhoto || !order) return;

    try {
      setUploadingPhoto(true);
      const photo = await verificationCameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      });

      // Upload the photo
      await api.uploadMachinePhoto(order._id, pendingMachineForPhoto.machineId, photo.base64);

      setShowVerificationCamera(false);
      setPendingMachineForPhoto(null);
      Alert.alert('Success', 'Verification photo saved');
      await loadOrder();
    } catch (error) {
      console.error('Photo upload error:', error);
      Alert.alert('Error', 'Failed to save photo');
    } finally {
      setUploadingPhoto(false);
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

  async function handleCheckMachine(assignment: MachineAssignment, forceSamePerson?: boolean) {
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
      const result = await api.checkMachine(order._id, assignment.machineId, initials, forceSamePerson);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error: any) {
      setCheckingMachine(null);
      const errorMessage = error?.message || 'Failed to check machine';
      // Check if this is a same-person warning that can be bypassed
      const isSamePersonError = error?.requireConfirmation ||
        errorMessage.includes('Ideally another person') ||
        errorMessage.includes('cannot check your own');

      if (isSamePersonError) {
        Alert.alert(
          'Same Person Check',
          'You assigned this machine. Ideally another person should verify.\n\nDo you want to check it anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Check Anyway',
              onPress: () => handleCheckMachine(assignment, true),
            },
          ]
        );
        return;
      }
      Alert.alert('Error', errorMessage);
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

  // Handle dryer unload (marking dryer as emptied)
  async function handleDryerUnload(assignment: MachineAssignment) {
    if (!order || !user) return;

    const initials = user.firstName?.[0] + (user.lastName?.[0] || '');

    setUpdating(true);
    try {
      const result = await api.unloadDryer(order._id, assignment.machineId, initials);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to mark dryer as unloaded';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
    }
  }

  // Handle dryer unload check (verifying dryer was properly emptied)
  async function handleDryerUnloadCheck(assignment: MachineAssignment, forceSamePerson?: boolean) {
    if (!order || !user) return;

    const initials = user.firstName?.[0] + (user.lastName?.[0] || '');

    setUpdating(true);
    try {
      const result = await api.checkDryerUnload(order._id, assignment.machineId, initials, forceSamePerson);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error: any) {
      if (error?.requireConfirmation) {
        Alert.alert(
          'Same Person',
          'You unloaded this dryer. Ideally another person should verify.\n\nDo you want to verify it anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Verify Anyway',
              onPress: () => handleDryerUnloadCheck(assignment, true),
            },
          ]
        );
      } else {
        const errorMessage = error?.message || 'Failed to verify dryer unload';
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setUpdating(false);
    }
  }

  // Handle starting folding for a specific dryer
  async function handleStartDryerFolding(assignment: MachineAssignment) {
    if (!order || !user) return;

    const initials = user.firstName?.[0] + (user.lastName?.[0] || '');

    setUpdating(true);
    try {
      const result = await api.startDryerFolding(order._id, assignment.machineId, initials);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to start folding';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
    }
  }

  // Handle marking a dryer as folded
  async function handleMarkDryerFolded(assignment: MachineAssignment) {
    if (!order || !user) return;

    const initials = user.firstName?.[0] + (user.lastName?.[0] || '');

    setUpdating(true);
    try {
      const result = await api.markDryerFolded(order._id, assignment.machineId, initials);
      Alert.alert('Success', result.message);
      await loadOrder();
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to mark as folded';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
    }
  }

  async function handlePaymentToggle() {
    if (!order) return;
    setUpdating(true);
    try {
      // If unpaying an order that used credit, refund the credit
      const customerIdForRefund = order.customer?._id || order.customerId;
      // Determine credit amount to refund: use creditApplied if set, or totalAmount if payment was credit
      const creditToRefund = order.creditApplied && order.creditApplied > 0
        ? order.creditApplied
        : (order.paymentMethod === 'credit' ? order.totalAmount : 0);

      if (order.isPaid && creditToRefund > 0 && customerIdForRefund) {
        try {
          await api.addCustomerCredit(
            customerIdForRefund,
            creditToRefund,
            `Refund from order #${order.orderId || order._id.slice(-6)} - payment reversed`
          );
          console.log(`Refunded $${creditToRefund} credit to customer ${customerIdForRefund}`);
        } catch (creditError) {
          console.error('Failed to refund credit:', creditError);
          Alert.alert('Warning', 'Payment cleared but credit refund failed. Please manually add credit to customer.');
        }
      }

      let updateData;
      let message;

      if (order.isPaid) {
        // Unpaying a fully paid order
        updateData = { isPaid: false, paymentMethod: 'pending' as PaymentMethod, paymentStatus: 'pending', creditApplied: 0, amountPaid: 0 };
        message = 'Payment status cleared';
      } else if (order.paymentStatus === 'partial') {
        // Marking a partially paid order as fully paid
        updateData = { isPaid: true, paymentMethod: selectedPaymentMethod, paymentStatus: 'paid', amountPaid: order.totalAmount };
        message = `Order marked as fully paid (${selectedPaymentMethod})`;
      } else {
        // Marking an unpaid order as paid
        updateData = { isPaid: true, paymentMethod: selectedPaymentMethod, paymentStatus: 'paid', amountPaid: order.totalAmount };
        message = `Order marked as paid (${selectedPaymentMethod})`;
      }

      await api.updateOrder(order._id, updateData);
      if (order.isPaid && creditToRefund > 0 && updateData.isPaid === false) {
        message += `. $${creditToRefund.toFixed(2)} credit refunded to customer.`;
      }

      Alert.alert('Success', message);
      await loadOrder();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update payment';
      Alert.alert('Error', errorMessage);
    } finally {
      setUpdating(false);
    }
  }

  // Handle using customer credit to pay
  async function handleUseCredit() {
    if (!order || !order.customer) return;

    const customerCredit = order.customer.credit || 0;
    // Calculate amount due: total minus amount already paid
    const amountDue = Math.max(0, (order.totalAmount || 0) - (order.amountPaid || 0));

    console.log('Use Credit calculation:', {
      customerCredit,
      totalAmount: order.totalAmount,
      amountPaid: order.amountPaid,
      creditApplied: order.creditApplied,
      amountDue
    });

    if (customerCredit <= 0) {
      Alert.alert('No Credit', 'This customer has no credit available.');
      return;
    }

    if (amountDue <= 0) {
      Alert.alert('Already Paid', 'This order is already fully paid.');
      return;
    }

    const creditToApply = Math.min(customerCredit, amountDue);
    const remainingDue = amountDue - creditToApply;

    Alert.alert(
      'Use Credit',
      `Apply $${creditToApply.toFixed(2)} credit to this order?\n\nCustomer credit: $${customerCredit.toFixed(2)}\nAmount due: $${amountDue.toFixed(2)}\nRemaining after credit: $${remainingDue.toFixed(2)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply Credit',
          onPress: async () => {
            setUpdating(true);
            try {
              console.log('Applying credit:', { creditToApply, customerId: order.customer!._id });

              if (creditToApply <= 0) {
                Alert.alert('Error', 'Credit amount must be greater than 0');
                setUpdating(false);
                return;
              }

              // Deduct credit from customer
              await api.useCustomerCredit(
                order.customer!._id,
                creditToApply,
                `Applied to order #${order.orderId || order._id.slice(-6)}`
              );

              // Update order with credit applied
              const updateData: any = {
                creditApplied: (order.creditApplied || 0) + creditToApply,
              };

              // If credit covers full amount, mark as paid
              if (remainingDue <= 0) {
                updateData.isPaid = true;
                updateData.paymentMethod = 'credit';
                updateData.paymentStatus = 'paid';
                updateData.amountPaid = order.totalAmount;
              } else {
                // Partial payment with credit - add to existing amountPaid
                updateData.paymentStatus = 'partial';
                updateData.amountPaid = (order.amountPaid || 0) + creditToApply;
              }

              await api.updateOrder(order._id, updateData);

              const successMessage = remainingDue <= 0
                ? `$${creditToApply.toFixed(2)} credit applied. Order fully paid!`
                : `$${creditToApply.toFixed(2)} credit applied. Remaining due: $${remainingDue.toFixed(2)}`;

              Alert.alert('Success', successMessage);
              await loadOrder();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Failed to apply credit';
              Alert.alert('Error', errorMessage);
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
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

  // Transfer order from washer to dryer
  async function handleTransfer() {
    if (!order) return;

    setTransferring(true);
    try {
      const result = await api.transferOrder(order._id);
      Alert.alert('Success', result.message || 'Order transferred to dryer');
      await loadOrder();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to transfer order';
      Alert.alert('Error', errorMessage);
    } finally {
      setTransferring(false);
    }
  }

  // Verify transfer (different person check with confirmation popup)
  async function handleVerifyTransfer(forceSamePerson = false) {
    if (!order) return;

    setVerifyingTransfer(true);
    try {
      const result = await api.verifyTransfer(order._id, forceSamePerson);

      // Check if we need confirmation (same person)
      if (result.requireConfirmation) {
        setVerifyingTransfer(false);
        Alert.alert(
          'Same Person Warning',
          result.message || 'You transferred this order. Are you sure you want to verify your own work?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Verify',
              onPress: () => handleVerifyTransfer(true),
            },
          ]
        );
        return;
      }

      Alert.alert('Success', result.message || 'Transfer verified');
      await loadOrder();
    } catch (error: unknown) {
      // Handle the same-person warning from API
      const err = error as { message?: string; requireConfirmation?: boolean };
      if (err.message === 'Same person warning') {
        Alert.alert(
          'Same Person Warning',
          'You transferred this order. Are you sure you want to verify your own work?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Verify',
              onPress: () => handleVerifyTransfer(true),
            },
          ]
        );
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Failed to verify transfer';
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setVerifyingTransfer(false);
    }
  }

  // Final check before marking ready
  async function handleFinalCheck(forceSamePerson = false) {
    if (!order) return;

    setDoingFinalCheck(true);
    try {
      // For now, we don't prompt for weight - can be added later
      const result = await api.finalCheck(order._id, undefined, forceSamePerson);

      // Check if we need confirmation (same person)
      if (result.requireConfirmation) {
        setDoingFinalCheck(false);
        Alert.alert(
          'Same Person Warning',
          result.message || 'You marked this order as folded. Are you sure you want to verify your own work?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Mark Ready',
              onPress: () => handleFinalCheck(true),
            },
          ]
        );
        return;
      }

      Alert.alert('Success', result.message || 'Order is now ready');
      await loadOrder();
    } catch (error: unknown) {
      // Handle the same-person warning from API
      const err = error as { message?: string; requireConfirmation?: boolean };
      if (err.message === 'Same person warning') {
        Alert.alert(
          'Same Person Warning',
          'You marked this order as folded. Are you sure you want to verify your own work?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Mark Ready',
              onPress: () => handleFinalCheck(true),
            },
          ]
        );
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Failed to complete final check';
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setDoingFinalCheck(false);
    }
  }

  // Open air dry camera
  function openAirDryCamera() {
    if (!permission?.granted) {
      requestPermission().then(result => {
        if (result.granted) {
          setShowAirDryCamera(true);
        } else {
          Alert.alert('Permission Required', 'Camera permission is needed to take photos');
        }
      });
    } else {
      setShowAirDryCamera(true);
    }
  }

  // Capture air dry item photo
  async function handleCaptureAirDryPhoto() {
    if (!airDryCameraRef.current || !order || !user) return;

    try {
      setAddingAirDry(true);
      const photo = await airDryCameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
      });

      // Get user name and initials
      const taggedBy = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
      let initials = 'XX';
      const firstInitial = user.firstName?.charAt(0) || '';
      const lastInitial = user.lastName?.charAt(0) || '';
      if (firstInitial && lastInitial) {
        initials = `${firstInitial}${lastInitial}`.toUpperCase();
      } else if (firstInitial) {
        initials = user.firstName.substring(0, 2).toUpperCase();
      }

      await api.addAirDryItem(order._id, {
        photo: `data:image/jpeg;base64,${photo.base64}`,
        description: airDryDescription.trim() || undefined,
        taggedBy,
        taggedByInitials: initials,
      });

      setShowAirDryCamera(false);
      setAirDryDescription('');
      Alert.alert('Success', 'Air dry item added');
      await loadOrder();
    } catch (error) {
      console.error('Air dry photo error:', error);
      Alert.alert('Error', 'Failed to add air dry item');
    } finally {
      setAddingAirDry(false);
    }
  }

  // Remove air dry item
  async function handleRemoveAirDryItem(itemId: string) {
    if (!order) return;

    Alert.alert(
      'Remove Air Dry Item',
      'Are you sure you want to remove this item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setUpdating(true);
              await api.removeAirDryItem(order._id, itemId);
              Alert.alert('Success', 'Air dry item removed');
              await loadOrder();
            } catch (error) {
              console.error('Remove air dry error:', error);
              Alert.alert('Error', 'Failed to remove air dry item');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
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
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  }

  // Format date like "Tue, Jan 12, 2026, 11:45 AM"
  function formatDateNice(date: Date | string | undefined | null): string {
    if (!date) return 'Not set';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'Not set';
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayName = days[d.getDay()];
      const monthName = months[d.getMonth()];
      const dayNum = d.getDate();
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${dayName}, ${monthName} ${dayNum}, ${year}, ${hours}:${minutes} ${ampm}`;
    } catch {
      return 'Not set';
    }
  }

  // Get active machine assignments (not removed), sorted: washers first, then dryers
  const activeMachines = (order?.machineAssignments?.filter(
    (a: MachineAssignment) => !a.removedAt
  ) || []).sort((a: MachineAssignment, b: MachineAssignment) => {
    // Washers first, dryers second
    if (a.machineType === 'washer' && b.machineType === 'dryer') return -1;
    if (a.machineType === 'dryer' && b.machineType === 'washer') return 1;
    // Within same type, sort by assignment time
    return new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime();
  });

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

  // Show payment section for all orders (allow marking paid at any stage)
  const showPaymentSection = true;

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
        {/* Back to Dashboard - Show when no back navigation available */}
        {!navigation.canGoBack() && (
          <TouchableOpacity
            style={styles.backToDashboard}
            onPress={() => navigation.reset({
              index: 0,
              routes: [{ name: 'Main' as never }],
            })}
          >
            <Ionicons name="arrow-back" size={20} color="#2563eb" />
            <Text style={styles.backToDashboardText}>Back to Dashboard</Text>
          </TouchableOpacity>
        )}

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
            <View>
              <Text style={styles.totalAmount}>${(order.totalAmount || 0).toFixed(2)}</Text>
              {(order.creditApplied ?? 0) > 0 ? (
                <View style={styles.headerCreditInfo}>
                  <Text style={styles.headerCreditText}>
                    Credit: -${order.creditApplied.toFixed(2)} | Due: ${Math.max(0, (order.totalAmount || 0) - (order.creditApplied || 0)).toFixed(2)}
                  </Text>
                </View>
              ) : null}
            </View>
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
            {order.orderType !== 'delivery' && order.customerPhone && (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
              >
                <Ionicons name="call" size={20} color="#2563eb" />
                <Text style={styles.contactText}>{formatPhoneNumber(order.customerPhone)}</Text>
              </TouchableOpacity>
            )}
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
              {order.keepSeparated && (
                <View style={[styles.tag, { backgroundColor: '#8b5cf6' }]}>
                  <Ionicons name="git-branch" size={12} color="#fff" />
                  <Text style={styles.tagText}>Separated</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Pickup Photos from Driver */}
        {pickupPhotos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Driver Pickup Photos ({pickupPhotos.length})
            </Text>
            <View style={styles.pickupPhotosCard}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickupPhotosScroll}
              >
                {pickupPhotos.map((photo, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.pickupPhotoWrapper}
                    onPress={() => setSelectedPhotoIndex(index)}
                  >
                    <Image
                      source={{ uri: api.getPickupPhotoUrl(photo.photoPath) }}
                      style={styles.pickupPhotoThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.pickupPhotoInfo}>
                      <Text style={styles.pickupPhotoBy}>{photo.capturedByName}</Text>
                      <Text style={styles.pickupPhotoTime}>
                        {new Date(photo.capturedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.pickupPhotoHint}>
                Tap photo to enlarge
              </Text>
            </View>
          </View>
        )}

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

        {/* Print Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Print</Text>
          <View style={styles.printCard}>
            <TouchableOpacity
              style={[styles.printButton, printing && styles.buttonDisabled, { marginBottom: 10 }]}
              onPress={showPrintMenu}
              disabled={printing}
            >
              <Ionicons name="print" size={20} color="#fff" />
              <Text style={styles.printButtonText}>{printing ? 'Printing...' : 'Print Receipt'}</Text>
              <Ionicons name="chevron-down" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printButton, styles.printButtonPurple, printing && styles.buttonDisabled, { marginBottom: 10 }]}
              onPress={handlePrintCustomerTag}
              disabled={printing}
            >
              <Ionicons name="pricetag" size={20} color="#fff" />
              <Text style={styles.printButtonText}>Print Customer Tag</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printButton, styles.printButtonOrange, printing && styles.buttonDisabled]}
              onPress={handlePrintBagLabels}
              disabled={printing || !order?.bags || order.bags.length === 0}
            >
              <Ionicons name="cube" size={20} color="#fff" />
              <Text style={styles.printButtonText}>Print Bag Labels ({order?.bags?.length || 0})</Text>
            </TouchableOpacity>
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
                          <View style={styles.machineNameRow}>
                            <Text style={styles.machineName}>{assignment.machineName}</Text>
                            {assignment.verificationPhoto && (
                              <TouchableOpacity
                                style={styles.verificationPhotoThumb}
                                onPress={() => setExpandedVerificationPhoto(`${api.getBaseUrl()}/api/uploads/${assignment.verificationPhoto}?token=${api.getToken()}`)}
                              >
                                <Image
                                  source={{ uri: `${api.getBaseUrl()}/api/uploads/${assignment.verificationPhoto}?token=${api.getToken()}` }}
                                  style={styles.verificationPhotoThumbImage}
                                />
                              </TouchableOpacity>
                            )}
                          </View>
                          <Text style={styles.machineType}>
                            {assignment.machineType}
                            {order.keepSeparated && assignment.bagIdentifier && (
                              <Text style={styles.bagIdentifierText}> • {assignment.bagIdentifier}</Text>
                            )}
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

                    {/* Check/Uncheck section - for verifying machine settings */}
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

                    {/* Dryer Unload section - for marking when clothes are taken out */}
                    {assignment.machineType === 'dryer' && assignment.isChecked && (
                      <View style={styles.checkSection}>
                        {!assignment.unloadedAt ? (
                          <>
                            <Text style={styles.checkHint}>When dryer is done, mark as unloaded:</Text>
                            <TouchableOpacity
                              style={[styles.checkButton, { backgroundColor: '#f97316' }, updating && styles.buttonDisabled]}
                              onPress={() => handleDryerUnload(assignment)}
                              disabled={updating}
                            >
                              {updating ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.checkButtonText}>Mark as Unloaded</Text>
                              )}
                            </TouchableOpacity>
                          </>
                        ) : !assignment.isUnloadChecked ? (
                          <>
                            <Text style={styles.checkedByText}>
                              Unloaded by: {assignment.unloadedBy}
                              {assignment.unloadedByInitials && ` (${assignment.unloadedByInitials})`}
                              {formatDate(assignment.unloadedAt) && ` - ${formatDate(assignment.unloadedAt)}`}
                            </Text>
                            <Text style={styles.checkHint}>Another person must verify unload:</Text>
                            <TouchableOpacity
                              style={[styles.checkButton, { backgroundColor: '#10b981' }, updating && styles.buttonDisabled]}
                              onPress={() => handleDryerUnloadCheck(assignment)}
                              disabled={updating}
                            >
                              {updating ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={styles.checkButtonText}>Verify Unload</Text>
                              )}
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View style={styles.dryerStatusContainer}>
                            {/* Step 1: Unloaded */}
                            <View style={styles.dryerStatusRow}>
                              <View style={[styles.dryerStatusDot, { backgroundColor: '#10b981' }]} />
                              <View style={styles.dryerStatusContent}>
                                <Text style={styles.dryerStatusLabel}>Unloaded</Text>
                                <Text style={styles.dryerStatusValue}>
                                  {assignment.unloadedBy}{assignment.unloadedByInitials && ` (${assignment.unloadedByInitials})`}
                                </Text>
                                <Text style={styles.dryerStatusDate}>{formatDate(assignment.unloadedAt)}</Text>
                              </View>
                            </View>

                            {/* Step 2: Verified */}
                            <View style={styles.dryerStatusRow}>
                              <View style={[styles.dryerStatusDot, { backgroundColor: '#10b981' }]} />
                              <View style={styles.dryerStatusContent}>
                                <Text style={styles.dryerStatusLabel}>Verified</Text>
                                <Text style={styles.dryerStatusValue}>
                                  {assignment.unloadCheckedBy}{assignment.unloadCheckedByInitials && ` (${assignment.unloadCheckedByInitials})`}
                                </Text>
                                <Text style={styles.dryerStatusDate}>{formatDate(assignment.unloadCheckedAt)}</Text>
                              </View>
                            </View>

                            {/* Step 3: Folding */}
                            {!assignment.isFolding && !assignment.isFolded && (
                              <View style={styles.dryerStatusRow}>
                                <View style={[styles.dryerStatusDot, { backgroundColor: '#d1d5db' }]} />
                                <View style={styles.dryerStatusContent}>
                                  <TouchableOpacity
                                    style={[styles.foldingButton, updating && styles.buttonDisabled]}
                                    onPress={() => handleStartDryerFolding(assignment)}
                                    disabled={updating}
                                  >
                                    {updating ? (
                                      <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                      <Text style={styles.foldingButtonText}>Start Folding</Text>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}

                            {assignment.isFolding && !assignment.isFolded && (
                              <View style={styles.dryerStatusRow}>
                                <View style={[styles.dryerStatusDot, { backgroundColor: '#8b5cf6' }]} />
                                <View style={styles.dryerStatusContent}>
                                  <Text style={[styles.dryerStatusLabel, { color: '#8b5cf6' }]}>Folding</Text>
                                  <Text style={styles.dryerStatusValue}>
                                    {assignment.foldingStartedBy}{assignment.foldingStartedByInitials && ` (${assignment.foldingStartedByInitials})`}
                                  </Text>
                                  <Text style={styles.dryerStatusDate}>{formatDate(assignment.foldingStartedAt)}</Text>
                                  <TouchableOpacity
                                    style={[styles.foldingButton, { backgroundColor: '#10b981', marginTop: 6 }, updating && styles.buttonDisabled]}
                                    onPress={() => handleMarkDryerFolded(assignment)}
                                    disabled={updating}
                                  >
                                    {updating ? (
                                      <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                      <Text style={styles.foldingButtonText}>Mark Folded</Text>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}

                            {assignment.isFolded && (
                              <>
                                <View style={styles.dryerStatusRow}>
                                  <View style={[styles.dryerStatusDot, { backgroundColor: '#8b5cf6' }]} />
                                  <View style={styles.dryerStatusContent}>
                                    <Text style={[styles.dryerStatusLabel, { color: '#8b5cf6' }]}>Folding</Text>
                                    <Text style={styles.dryerStatusValue}>
                                      {assignment.foldingStartedBy}{assignment.foldingStartedByInitials && ` (${assignment.foldingStartedByInitials})`}
                                    </Text>
                                    <Text style={styles.dryerStatusDate}>{formatDate(assignment.foldingStartedAt)}</Text>
                                  </View>
                                </View>
                                <View style={styles.dryerStatusRow}>
                                  <View style={[styles.dryerStatusDot, { backgroundColor: '#10b981' }]} />
                                  <View style={styles.dryerStatusContent}>
                                    <Text style={[styles.dryerStatusLabel, { color: '#10b981' }]}>Folded ✓</Text>
                                    <Text style={styles.dryerStatusValue}>
                                      {assignment.foldedBy}{assignment.foldedByInitials && ` (${assignment.foldedByInitials})`}
                                    </Text>
                                    <Text style={styles.dryerStatusDate}>{formatDate(assignment.foldedAt)}</Text>
                                  </View>
                                </View>
                              </>
                            )}
                          </View>
                        )}
                      </View>
                    )}

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

        {/* Transfer to Dryers - Show when status is 'in_washer' */}
        {order.status === 'in_washer' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next Step: Transfer</Text>
            <View style={styles.verifyLayeringCard}>
              <View style={styles.verifyLayeringHeader}>
                <Ionicons name="swap-horizontal" size={24} color="#0ea5e9" />
                <Text style={styles.verifyLayeringTitle}>Transfer to Dryers</Text>
              </View>
              <Text style={styles.verifyLayeringText}>
                Mark when you have moved all clothes from the washer(s) to the dryer(s).
              </Text>
              <TouchableOpacity
                style={[styles.verifyLayeringButton, { backgroundColor: '#0ea5e9' }, transferring && styles.buttonDisabled]}
                onPress={handleTransfer}
                disabled={transferring || !user}
              >
                {transferring ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                    <Text style={styles.verifyLayeringButtonText}>
                      Mark as Transferred
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Verify Transfer - Show when status is 'transferred' */}
        {order.status === 'transferred' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verify Transfer</Text>
            <View style={styles.verifyLayeringCard}>
              <View style={styles.verifyLayeringHeader}>
                <Ionicons name="checkmark-circle" size={24} color="#14b8a6" />
                <Text style={styles.verifyLayeringTitle}>Transfer Check Required</Text>
              </View>
              <Text style={styles.verifyLayeringText}>
                Verify that all washers are empty and dryers are set correctly. Then scan the dryer QR codes.
              </Text>
              <TouchableOpacity
                style={[styles.verifyLayeringButton, { backgroundColor: '#14b8a6' }, verifyingTransfer && styles.buttonDisabled]}
                onPress={() => handleVerifyTransfer()}
                disabled={verifyingTransfer || !user}
              >
                {verifyingTransfer ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#fff" />
                    <Text style={styles.verifyLayeringButtonText}>
                      Verify Transfer Complete
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Process History - Machines, Transfer, Layering, Folding */}
        {(allMachineAssignments.length > 0 || order.transferredBy || order.transferCheckedBy || order.layeringCheckedBy || order.foldingStartedBy || order.foldedBy || order.foldingCheckedBy) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Process History</Text>
            <View style={styles.historyCard}>
              {allMachineAssignments
                .sort((a: MachineAssignment, b: MachineAssignment) =>
                  new Date(a.assignedAt).getTime() - new Date(b.assignedAt).getTime()
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
                      <View style={styles.historyMachineRow}>
                        <Ionicons
                          name={assignment.machineType === 'washer' ? 'water' : 'flame'}
                          size={18}
                          color={assignment.machineType === 'washer' ? '#3b82f6' : '#f97316'}
                        />
                        <Text style={styles.historyMachine}> {assignment.machineName}</Text>
                      </View>
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
                      Assigned by: {assignment.assignedBy || 'Unknown'}{assignment.assignedByInitials ? ` (${assignment.assignedByInitials})` : ''} - {formatDate(assignment.assignedAt)}
                    </Text>
                    {assignment.isChecked && assignment.checkedBy && (
                      <Text style={styles.historyDetail}>
                        Checked by: {assignment.checkedBy}{assignment.checkedByInitials ? ` (${assignment.checkedByInitials})` : ''} - {formatDate(assignment.checkedAt)}
                      </Text>
                    )}
                  </View>
                ))}

              {/* Dryer Unload History */}
              {allMachineAssignments
                .filter((a: MachineAssignment) => a.machineType === 'dryer' && a.unloadedAt)
                .sort((a: MachineAssignment, b: MachineAssignment) =>
                  new Date(a.unloadedAt!).getTime() - new Date(b.unloadedAt!).getTime()
                )
                .map((assignment: MachineAssignment, index: number) => (
                  <View
                    key={`unload-${index}`}
                    style={[
                      styles.historyItem,
                      assignment.isUnloadChecked ? styles.historyItemChecked : styles.historyItemDone,
                    ]}
                  >
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyMachine}>📤 {assignment.machineName} Unloaded</Text>
                      <View style={[
                        styles.historyBadge,
                        assignment.isUnloadChecked ? styles.historyBadgeChecked : styles.historyBadgeDone,
                      ]}>
                        <Text style={styles.historyBadgeText}>
                          {assignment.isUnloadChecked ? 'Verified' : 'Pending Check'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historyDetail}>
                      Unloaded by: {assignment.unloadedBy}{assignment.unloadedByInitials ? ` (${assignment.unloadedByInitials})` : ''} - {formatDate(assignment.unloadedAt)}
                    </Text>
                    {assignment.isUnloadChecked && assignment.unloadCheckedBy && (
                      <Text style={styles.historyDetail}>
                        Verified by: {assignment.unloadCheckedBy}{assignment.unloadCheckedByInitials ? ` (${assignment.unloadCheckedByInitials})` : ''} - {formatDate(assignment.unloadCheckedAt)}
                      </Text>
                    )}
                  </View>
                ))}

              {/* Transfer History */}
              {order.transferredBy && (
                <View style={[styles.historyItem, styles.historyItemDone]}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyMachine}>🔄 Transfer</Text>
                    <View style={[styles.historyBadge, styles.historyBadgeDone]}>
                      <Text style={styles.historyBadgeText}>Done</Text>
                    </View>
                  </View>
                  <Text style={styles.historyDetail}>
                    Transferred by: {order.transferredBy}{order.transferredByInitials ? ` (${order.transferredByInitials})` : ''} - {formatDate(order.transferredAt)}
                  </Text>
                </View>
              )}

              {/* Transfer Check History */}
              {order.transferCheckedBy && (
                <View style={[styles.historyItem, styles.historyItemChecked]}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyMachine}>✅ Transfer Verified</Text>
                    <View style={[styles.historyBadge, styles.historyBadgeChecked]}>
                      <Text style={styles.historyBadgeText}>Verified</Text>
                    </View>
                  </View>
                  <Text style={styles.historyDetail}>
                    Checked by: {order.transferCheckedBy}{order.transferCheckedByInitials ? ` (${order.transferCheckedByInitials})` : ''} - {formatDate(order.transferCheckedAt)}
                  </Text>
                </View>
              )}

              {/* Layering Verification History */}
              {order.layeringCheckedBy && (
                <View style={[styles.historyItem, styles.historyItemChecked]}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyMachine}>📦 On Cart</Text>
                    <View style={[styles.historyBadge, styles.historyBadgeChecked]}>
                      <Text style={styles.historyBadgeText}>Verified</Text>
                    </View>
                  </View>
                  <Text style={styles.historyDetail}>
                    Checked by: {order.layeringCheckedBy} ({order.layeringCheckedByInitials}) - {formatDate(order.layeringCheckedAt)}
                  </Text>
                </View>
              )}

              {/* Folding History - All grouped together */}
              {(order.foldingStartedBy || order.foldedBy || order.foldingCheckedBy) && (
                <View style={[styles.historyItem, order.foldingCheckedBy ? styles.historyItemChecked : styles.historyItemDone]}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyMachine}>👕 Folding</Text>
                    {order.foldingCheckedBy && (
                      <View style={[styles.historyBadge, styles.historyBadgeChecked]}>
                        <Text style={styles.historyBadgeText}>Verified</Text>
                      </View>
                    )}
                  </View>
                  {order.foldingStartedBy && (
                    <Text style={styles.historyDetail}>
                      Started by: {order.foldingStartedBy} ({order.foldingStartedByInitials}) - {formatDate(order.foldingStartedAt)}
                    </Text>
                  )}
                  {order.foldedBy && (
                    <Text style={styles.historyDetail}>
                      Finished by: {order.foldedBy} ({order.foldedByInitials}) - {formatDate(order.foldedAt)}
                    </Text>
                  )}
                  {order.foldingCheckedBy && (
                    <Text style={styles.historyDetail}>
                      Checked by: {order.foldingCheckedBy} ({order.foldingCheckedByInitials}) - {formatDate(order.foldingCheckedAt)}
                    </Text>
                  )}
                </View>
              )}
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

        {/* Air Dry Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Air Dry Items {order.airDryItems && order.airDryItems.length > 0 ? `(${order.airDryItems.length})` : ''}
            </Text>
            <TouchableOpacity
              style={styles.addAirDryButton}
              onPress={openAirDryCamera}
            >
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={styles.addAirDryButtonText}>Add Item</Text>
            </TouchableOpacity>
          </View>
          {order.airDryItems && order.airDryItems.length > 0 ? (
            <View style={styles.airDryContainer}>
              {order.airDryItems.map((item: AirDryItem, index: number) => (
                <View key={item._id || index} style={styles.airDryCard}>
                  <TouchableOpacity
                    style={styles.airDryPhotoWrapper}
                    onPress={() => setExpandedAirDryPhoto(`${api.getBaseUrl()}/api/uploads/${item.photoPath}?token=${api.getToken()}`)}
                  >
                    <Image
                      source={{ uri: `${api.getBaseUrl()}/api/uploads/${item.photoPath}?token=${api.getToken()}` }}
                      style={styles.airDryPhoto}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                  <View style={styles.airDryInfo}>
                    {item.description ? (
                      <Text style={styles.airDryDescription}>{item.description}</Text>
                    ) : (
                      <Text style={styles.airDryNoDescription}>No description</Text>
                    )}
                    <Text style={styles.airDryTaggedBy}>
                      Tagged by {item.taggedByInitials || item.taggedBy}
                    </Text>
                    <Text style={styles.airDryTime}>
                      {new Date(item.taggedAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.removeAirDryButton}
                      onPress={() => handleRemoveAirDryItem(item._id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noAirDryCard}>
              <Ionicons name="leaf-outline" size={32} color="#94a3b8" />
              <Text style={styles.noAirDryText}>No air dry items tagged</Text>
              <Text style={styles.noAirDryHint}>Tap "Add Item" to tag items that need air drying</Text>
            </View>
          )}
        </View>



        {/* Final Check - Show only when status is 'folded' and not yet final checked */}
        {order.status === 'folded' && !order.finalCheckedBy && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Final Quality Check</Text>
            <View style={styles.verifyFoldingCard}>
              <View style={styles.verifyFoldingHeader}>
                <Ionicons name="flag" size={24} color="#ef4444" />
                <Text style={styles.verifyFoldingTitle}>Final Check Required</Text>
              </View>
              <Text style={styles.verifyFoldingText}>
                Verify all {order.bags?.length || 0} bag(s) are correctly folded and ready.
                This will move the order to {order.orderType === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}.
              </Text>
              <TouchableOpacity
                style={[styles.verifyFoldingButton, { backgroundColor: '#ef4444' }, doingFinalCheck && styles.buttonDisabled]}
                onPress={() => handleFinalCheck()}
                disabled={doingFinalCheck || !user}
              >
                {doingFinalCheck ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={20} color="#fff" />
                    <Text style={styles.verifyFoldingButtonText}>
                      Complete Final Check
                    </Text>
                  </>
                )}
              </TouchableOpacity>
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
                <Text style={styles.itemPrice}>${(item.total || 0).toFixed(2)}</Text>
              </View>
            ))}
            {order.extraItems && order.extraItems.length > 0 && (
              <View style={styles.extraItemsSection}>
                <Text style={styles.extraItemsLabel}>Extra Items</Text>
                {order.extraItems.map((item: any, index) => {
                  const itemName = item.name || item.item?.name || 'Extra Item';
                  // Use overrideTotal if set, otherwise calculate
                  const itemTotal = item.overrideTotal !== undefined && item.overrideTotal !== null
                    ? item.overrideTotal
                    : item.price * item.quantity;
                  const hasOverride = item.overrideTotal !== undefined && item.overrideTotal !== null;
                  return (
                    <View key={`extra-${index}`} style={styles.itemRow}>
                      <Text style={styles.itemName}>{itemName}</Text>
                      <Text style={[styles.itemPrice, hasOverride && { color: '#ef4444' }]}>${(itemTotal || 0).toFixed(2)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${(order.totalAmount || 0).toFixed(2)}</Text>
            </View>
            {/* Show credit applied if any */}
            {(order.creditApplied ?? 0) > 0 ? (
              <>
                <View style={styles.creditAppliedRow}>
                  <Text style={styles.creditAppliedLabel}>Credit Applied</Text>
                  <Text style={styles.creditAppliedValue}>-${order.creditApplied.toFixed(2)}</Text>
                </View>
                <View style={styles.balanceDueRow}>
                  <Text style={styles.balanceDueLabel}>Balance Due</Text>
                  <Text style={[styles.balanceDueValue, order.isPaid && { color: '#10b981' }]}>
                    ${order.isPaid ? '0.00' : Math.max(0, (order.totalAmount || 0) - (order.creditApplied || 0)).toFixed(2)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Instructions - Customer notes and special instructions */}
        {(order.specialInstructions || order.customer?.notes) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <View style={styles.notesCard}>
              {order.customer?.notes && (
                <View style={styles.customerNotesSection}>
                  <View style={styles.instructionLabelRow}>
                    <Ionicons name="person-circle-outline" size={16} color="#8b5cf6" />
                    <Text style={styles.instructionLabel}>Customer:</Text>
                  </View>
                  {order.customer.notes.split('\n').filter(line => line.trim()).map((line, idx) => (
                    <View key={`cn-${idx}`} style={styles.bulletRow}>
                      <Text style={styles.bulletPoint}>•</Text>
                      <Text style={[styles.notesText, styles.customerNotesText]}>{line.trim()}</Text>
                    </View>
                  ))}
                </View>
              )}
              {order.specialInstructions && order.customer?.notes && order.specialInstructions !== order.customer.notes && (
                <View style={styles.divider} />
              )}
              {order.specialInstructions && order.specialInstructions !== order.customer?.notes && (
                <View style={styles.orderNotesSection}>
                  <View style={styles.instructionLabelRow}>
                    <Ionicons name="document-text-outline" size={16} color="#2563eb" />
                    <Text style={styles.instructionLabel}>Order:</Text>
                  </View>
                  {order.specialInstructions.split('\n').filter(line => line.trim()).map((line, idx) => (
                    <View key={`si-${idx}`} style={styles.bulletRow}>
                      <Text style={styles.bulletPoint}>•</Text>
                      <Text style={styles.notesText}>{line.trim()}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Payment - Only show for ready/completed orders or if already paid */}
        {showPaymentSection && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={[styles.paymentCard, order.isPaid && styles.paymentCardPaid, order.paymentStatus === 'partial' && styles.paymentCardPartial]}>
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
              ) : order.paymentStatus === 'partial' ? (
                <View style={styles.paymentPartial}>
                  <View style={styles.partialBadge}>
                    <Ionicons name="alert-circle" size={16} color="#fff" />
                    <Text style={styles.partialBadgeText}>Partially Paid</Text>
                  </View>
                  <View style={styles.partialDetails}>
                    <Text style={styles.partialAmountText}>
                      Paid: ${(order.amountPaid || 0).toFixed(2)}
                    </Text>
                    <Text style={styles.balanceDueText}>
                      Balance Due: ${((order.totalAmount || 0) - (order.amountPaid || 0)).toFixed(2)}
                    </Text>
                  </View>
                  {/* Show Use Credit button if customer has credit */}
                  {(order.customer?.credit ?? 0) > 0 && (
                    <TouchableOpacity
                      style={[styles.useCreditButton, updating && styles.buttonDisabled]}
                      onPress={handleUseCredit}
                      disabled={updating}
                    >
                      <Ionicons name="wallet-outline" size={18} color="#fff" />
                      <Text style={styles.useCreditButtonText}>
                        Use Credit (${order.customer!.credit!.toFixed(2)} available)
                      </Text>
                    </TouchableOpacity>
                  )}
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
                    <Text style={styles.markPaidButtonText}>Mark Fully Paid</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.paymentPending}>
                  {/* Show Use Credit button if customer has credit */}
                  {(order.customer?.credit ?? 0) > 0 && (
                    <TouchableOpacity
                      style={[styles.useCreditButton, updating && styles.buttonDisabled]}
                      onPress={handleUseCredit}
                      disabled={updating}
                    >
                      <Ionicons name="wallet-outline" size={18} color="#fff" />
                      <Text style={styles.useCreditButtonText}>
                        Use Credit (${order.customer!.credit!.toFixed(2)} available)
                      </Text>
                    </TouchableOpacity>
                  )}
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

      {/* Bag Picker Modal for keepSeparated orders */}
      <Modal
        visible={showBagPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowBagPicker(false);
          setPendingQrCode(null);
          setPendingMachineInfo(null);
          setAvailableBags([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.bagPickerModal}>
            <View style={styles.bagPickerHeader}>
              <View>
                <Text style={styles.bagPickerTitle}>Select Bag</Text>
                {pendingMachineInfo && (
                  <Text style={styles.bagPickerSubtitle}>
                    Assigning to {pendingMachineInfo.name} ({pendingMachineInfo.type})
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowBagPicker(false);
                  setPendingQrCode(null);
                  setPendingMachineInfo(null);
                  setAvailableBags([]);
                }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {loadingBags ? (
              <View style={styles.bagPickerLoading}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.bagPickerLoadingText}>Loading bags...</Text>
              </View>
            ) : availableBags.length === 0 ? (
              <View style={styles.bagPickerEmpty}>
                <Ionicons name="cube-outline" size={48} color="#94a3b8" />
                <Text style={styles.bagPickerEmptyText}>
                  All bags already have a {pendingMachineInfo?.type} assigned
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.bagPickerList}>
                {availableBags.map((bag, index) => (
                  <TouchableOpacity
                    key={bag.identifier}
                    style={styles.bagPickerItem}
                    onPress={() => handleBagSelected(bag)}
                  >
                    <View style={styles.bagPickerItemLeft}>
                      <View style={styles.bagPickerIcon}>
                        <Ionicons name="cube" size={24} color="#8b5cf6" />
                      </View>
                      <View>
                        <Text style={styles.bagPickerItemTitle}>{bag.identifier}</Text>
                        <Text style={styles.bagPickerItemSubtitle}>
                          {bag.weight ? `${bag.weight} lbs` : 'No weight'}
                          {bag.color ? ` • ${bag.color}` : ''}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Verification Camera Modal */}
      <Modal
        visible={showVerificationCamera}
        animationType="slide"
        onRequestClose={() => {
          setShowVerificationCamera(false);
          setPendingMachineForPhoto(null);
        }}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>
              Verify {pendingMachineForPhoto?.machineName} Settings
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowVerificationCamera(false);
                setPendingMachineForPhoto(null);
              }}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {permission?.granted ? (
            <CameraView
              ref={verificationCameraRef}
              style={styles.camera}
              facing="back"
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderText}>Camera permission required</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.verificationPhotoControls}>
            <Text style={styles.verificationPhotoHint}>
              Take a photo of the machine panel showing settings (water temp, cycle type, etc.)
            </Text>
            <TouchableOpacity
              style={[styles.captureButton, uploadingPhoto && styles.buttonDisabled]}
              onPress={captureVerificationPhoto}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.captureButtonInner}>
                  <Ionicons name="camera" size={32} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Expanded Verification Photo Modal with Pinch Zoom */}
      <Modal
        visible={!!expandedVerificationPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedVerificationPhoto(null)}
      >
        <View style={styles.expandedPhotoOverlay}>
          <TouchableOpacity
            style={styles.expandedPhotoClose}
            onPress={() => setExpandedVerificationPhoto(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {expandedVerificationPhoto && (
            <ReactNativeZoomableView
              maxZoom={3}
              minZoom={1}
              zoomStep={0.5}
              initialZoom={1}
              bindToBorders={true}
              style={styles.zoomableView}
            >
              <Image
                source={{ uri: expandedVerificationPhoto }}
                style={styles.expandedPhotoImage}
                resizeMode="contain"
              />
            </ReactNativeZoomableView>
          )}
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

      {/* Photo Viewer Modal */}
      <Modal
        visible={selectedPhotoIndex !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedPhotoIndex(null)}
      >
        <View style={styles.photoViewerOverlay}>
          <TouchableOpacity
            style={styles.photoViewerClose}
            onPress={() => setSelectedPhotoIndex(null)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>

          {selectedPhotoIndex !== null && pickupPhotos[selectedPhotoIndex] && (
            <>
              <Image
                source={{ uri: api.getPickupPhotoUrl(pickupPhotos[selectedPhotoIndex].photoPath) }}
                style={styles.photoViewerImage}
                resizeMode="contain"
              />

              <View style={styles.photoViewerInfo}>
                <Text style={styles.photoViewerBy}>
                  Photo by {pickupPhotos[selectedPhotoIndex].capturedByName}
                </Text>
                <Text style={styles.photoViewerTime}>
                  {new Date(pickupPhotos[selectedPhotoIndex].capturedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </Text>
              </View>

              {pickupPhotos.length > 1 && (
                <View style={styles.photoViewerNav}>
                  <TouchableOpacity
                    style={[styles.photoNavButton, selectedPhotoIndex === 0 && styles.photoNavButtonDisabled]}
                    onPress={() => setSelectedPhotoIndex(Math.max(0, selectedPhotoIndex - 1))}
                    disabled={selectedPhotoIndex === 0}
                  >
                    <Ionicons name="chevron-back" size={28} color={selectedPhotoIndex === 0 ? '#64748b' : '#fff'} />
                  </TouchableOpacity>
                  <Text style={styles.photoCounter}>
                    {selectedPhotoIndex + 1} / {pickupPhotos.length}
                  </Text>
                  <TouchableOpacity
                    style={[styles.photoNavButton, selectedPhotoIndex === pickupPhotos.length - 1 && styles.photoNavButtonDisabled]}
                    onPress={() => setSelectedPhotoIndex(Math.min(pickupPhotos.length - 1, selectedPhotoIndex + 1))}
                    disabled={selectedPhotoIndex === pickupPhotos.length - 1}
                  >
                    <Ionicons name="chevron-forward" size={28} color={selectedPhotoIndex === pickupPhotos.length - 1 ? '#64748b' : '#fff'} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </Modal>

      {/* Air Dry Camera Modal */}
      <Modal
        visible={showAirDryCamera}
        animationType="slide"
        onRequestClose={() => {
          setShowAirDryCamera(false);
          setAirDryDescription('');
        }}
      >
        <KeyboardAvoidingView
          style={styles.scannerContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Tag Air Dry Item</Text>
            <TouchableOpacity
              onPress={() => {
                setShowAirDryCamera(false);
                setAirDryDescription('');
              }}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {permission?.granted ? (
            <CameraView
              ref={airDryCameraRef}
              style={styles.camera}
              facing="back"
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderText}>Camera permission required</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                <Text style={styles.permissionButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.airDryCameraControls}>
            <TextInput
              style={styles.airDryDescriptionInput}
              value={airDryDescription}
              onChangeText={setAirDryDescription}
              placeholder="Optional description (e.g., Red silk blouse)"
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity
              style={[styles.captureButton, addingAirDry && styles.buttonDisabled]}
              onPress={handleCaptureAirDryPhoto}
              disabled={addingAirDry}
            >
              {addingAirDry ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.captureButtonInner}>
                  <Ionicons name="camera" size={32} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Expanded Air Dry Photo Modal */}
      <Modal
        visible={!!expandedAirDryPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedAirDryPhoto(null)}
      >
        <View style={styles.expandedPhotoOverlay}>
          <TouchableOpacity
            style={styles.expandedPhotoClose}
            onPress={() => setExpandedAirDryPhoto(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {expandedAirDryPhoto && (
            <ReactNativeZoomableView
              maxZoom={3}
              minZoom={1}
              zoomStep={0.5}
              initialZoom={1}
              bindToBorders={true}
              style={styles.zoomableView}
            >
              <Image
                source={{ uri: expandedAirDryPhoto }}
                style={styles.expandedPhotoImage}
                resizeMode="contain"
              />
            </ReactNativeZoomableView>
          )}
        </View>
      </Modal>

      </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  backToDashboard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backToDashboardText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
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
  headerCreditInfo: {
    marginTop: 4,
  },
  headerCreditText: {
    fontSize: 14,
    color: '#86efac',
    fontWeight: '500',
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
  printButtonOrange: {
    backgroundColor: '#f97316',
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
  machineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationPhotoThumb: {
    marginLeft: 8,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  verificationPhotoThumbImage: {
    width: 32,
    height: 32,
  },
  expandedPhotoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedPhotoContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedPhotoClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  expandedPhotoImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
  zoomableView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  machineType: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  checkedText: {
    color: '#10b981',
  },
  bagIdentifierText: {
    color: '#8b5cf6',
    fontWeight: '600',
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
  dryerStatusContainer: {
    marginTop: 4,
  },
  dryerStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  dryerStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    marginRight: 10,
  },
  dryerStatusContent: {
    flex: 1,
  },
  dryerStatusLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dryerStatusValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500',
    marginTop: 1,
  },
  dryerStatusDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  foldingButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  foldingButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  historyMachineRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  // Credit applied
  creditAppliedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#dcfce7',
    marginTop: 8,
  },
  creditAppliedLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10b981',
  },
  creditAppliedValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  balanceDueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
  },
  balanceDueLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  balanceDueValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ef4444',
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
  // Instructions with bullet points
  customerNotesSection: {
    marginBottom: 4,
  },
  orderNotesSection: {
    marginTop: 4,
  },
  instructionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  instructionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#78716c',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 8,
    marginBottom: 4,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#92400e',
    marginRight: 8,
    fontWeight: '600',
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
  paymentCardPartial: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  paymentPartial: {
    gap: 12,
  },
  partialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  partialBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  partialDetails: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  partialAmountText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '500',
  },
  balanceDueText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '700',
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
  useCreditButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  useCreditButtonText: {
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
  // Verification photo controls
  verificationPhotoControls: {
    padding: 20,
    backgroundColor: '#0f172a',
    alignItems: 'center',
  },
  verificationPhotoHint: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonInner: {
    justifyContent: 'center',
    alignItems: 'center',
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
  // Verify layering section (dryer check)
  verifyLayeringCard: {
    backgroundColor: '#ffedd5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#f97316',
  },
  verifyLayeringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  verifyLayeringTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9a3412',
  },
  verifyLayeringText: {
    fontSize: 14,
    color: '#c2410c',
    marginBottom: 16,
    lineHeight: 20,
  },
  verifyLayeringButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f97316',
    paddingVertical: 14,
    borderRadius: 10,
  },
  verifyLayeringButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Layering verified card
  layeringVerifiedCard: {
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  layeringVerifiedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  layeringVerifiedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
  },
  layeringVerifiedValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14532d',
  },
  layeringVerifiedTime: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 6,
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
  // Pickup photos styles
  pickupPhotosCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pickupPhotosScroll: {
    gap: 10,
  },
  pickupPhotoWrapper: {
    alignItems: 'center',
  },
  pickupPhotoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  pickupPhotoInfo: {
    marginTop: 6,
    alignItems: 'center',
  },
  pickupPhotoBy: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
  },
  pickupPhotoTime: {
    fontSize: 10,
    color: '#64748b',
  },
  pickupPhotoHint: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 10,
  },
  // Photo viewer modal
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  photoViewerImage: {
    width: '100%',
    height: '60%',
  },
  photoViewerInfo: {
    marginTop: 20,
    alignItems: 'center',
  },
  photoViewerBy: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  photoViewerTime: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  photoViewerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 20,
  },
  photoNavButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 25,
  },
  photoNavButtonDisabled: {
    opacity: 0.3,
  },
  photoCounter: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  // Air Dry styles
  addAirDryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addAirDryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  airDryContainer: {
    gap: 12,
  },
  airDryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  airDryPhotoWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  airDryPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  airDryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  airDryDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  airDryNoDescription: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#94a3b8',
    marginBottom: 4,
  },
  airDryTaggedBy: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  airDryTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  removeAirDryButton: {
    padding: 8,
  },
  noAirDryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  noAirDryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 12,
  },
  noAirDryHint: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
    textAlign: 'center',
  },
  airDryCameraControls: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
    backgroundColor: '#000',
  },
  airDryDescriptionInput: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    marginBottom: 20,
  },
  // Bag picker modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  bagPickerModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  bagPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  bagPickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  bagPickerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  bagPickerLoading: {
    padding: 40,
    alignItems: 'center',
  },
  bagPickerLoadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  bagPickerEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  bagPickerEmptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  bagPickerList: {
    padding: 16,
  },
  bagPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bagPickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bagPickerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bagPickerItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  bagPickerItemSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
});
