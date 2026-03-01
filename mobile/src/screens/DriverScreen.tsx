import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Linking,
  ActivityIndicator,
  ScrollView,
  Modal,
  TextInput,
  Platform,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Device } from 'react-native-ble-plx';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { bluetoothPrinter } from '../services/BluetoothPrinter';
import type { Order, Settings } from '../types';
import { formatPhoneNumber } from '../utils/phoneFormat';

const LAST_PRINTER_KEY = 'last_connected_printer';

// Format time with time frames or exact time
function formatTimeWithFrames(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const hours = d.getHours();
  const minutes = d.getMinutes();

  // 1-hour windows (minute=0)
  if (minutes === 0) {
    if (hours === 10) return '10-11AM';
    if (hours === 11) return '11AM-12PM';
    if (hours === 16) return '4-5PM';
    if (hours === 17) return '5-6PM';
  }
  // 2-hour windows (minute=1 as marker)
  if (minutes === 1) {
    if (hours === 10) return '10AM-12PM';
    if (hours === 16) return '4-6PM';
  }
  // Exact time
  let displayHours = hours % 12;
  displayHours = displayHours ? displayHours : 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Format date with time for driver cards
function formatDateWithTime(date: Date | string | null | undefined): { date: string; time: string } | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateDay = new Date(d);
  dateDay.setHours(0, 0, 0, 0);

  let dateStr: string;
  if (dateDay.getTime() === today.getTime()) {
    dateStr = 'Today';
  } else if (dateDay.getTime() === tomorrow.getTime()) {
    dateStr = 'Tomorrow';
  } else {
    dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const timeStr = formatTimeWithFrames(d);
  return { date: dateStr, time: timeStr };
}

// Format payment method for display
function formatPaymentMethod(method: string | undefined): string {
  if (!method) return '';
  const methodMap: Record<string, string> = {
    cash: 'Cash',
    check: 'Check',
    venmo: 'Venmo',
    zelle: 'Zelle',
    credit_card: 'Card',
    credit: 'Credit',
  };
  return methodMap[method] || method;
}

// Clean address for navigation - remove apartment/unit/floor info
function cleanAddressForNavigation(address: string): string {
  if (!address) return '';

  let cleaned = address;

  // First, remove "number + floor indicator" patterns: "2 flr", "2nd floor", "3rd fl"
  cleaned = cleaned.replace(/\s+\d+\s*(flr|floor|fl)\b/gi, '');
  cleaned = cleaned.replace(/\s+\d+(st|nd|rd|th)\s*(floor|flr|fl)\b/gi, '');

  // Remove floor descriptions: "second floor", "ground floor"
  cleaned = cleaned.replace(/\s+(first|second|third|fourth|fifth|ground|basement)\s*(floor|flr)?\b/gi, '');

  // Remove apartment/unit patterns: "Apt 3", "Unit 4B", "Suite 100"
  cleaned = cleaned.replace(/\s+(apt|apartment|unit|suite|ste)\.?\s*\w+/gi, '');

  // Remove hash patterns: "#1a", "# 2B"
  cleaned = cleaned.replace(/\s*#\s*\w+/gi, '');

  // Clean up extra commas and spaces
  cleaned = cleaned.replace(/,\s*,/g, ',');
  cleaned = cleaned.replace(/\s+,/g, ',');
  cleaned = cleaned.replace(/,\s*$/g, '');
  cleaned = cleaned.replace(/^\s*,/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.trim();

  return cleaned;
}

type MapApp = 'google' | 'apple' | 'waze';

interface RouteStop {
  order: Order;
  address: string;
  editedAddress?: string;
}

type Tab = 'pickups' | 'deliveries';

export default function DriverScreen() {
  const insets = useSafeAreaInsets();
  const [pickupOrders, setPickupOrders] = useState<Order[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('pickups');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Printer state
  const [showPrinterModal, setShowPrinterModal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [lastPrinterId, setLastPrinterId] = useState<string | null>(null);

  // Route planning state
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [editingStopIndex, setEditingStopIndex] = useState<number | null>(null);
  const [editAddressText, setEditAddressText] = useState('');
  const [selectedMapApp, setSelectedMapApp] = useState<MapApp>('google');
  const [optimizing, setOptimizing] = useState(false);
  const [routeStats, setRouteStats] = useState<{ distance: string; duration: string } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  // Date filters
  const [deliveryDateFilter, setDeliveryDateFilter] = useState<'today' | 'tomorrow' | 'all'>('today');
  const [pickupDateFilter, setPickupDateFilter] = useState<'today' | 'tomorrow' | 'all'>('today');

  // Camera state for pickup photos
  const [permission, requestPermission] = useCameraPermissions();
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoOrderId, setPhotoOrderId] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedPhotoCount, setUploadedPhotoCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  // Helper to check if date matches filter
  const isDateMatch = (dateStr: string | undefined, filter: 'today' | 'tomorrow' | 'all'): boolean => {
    if (filter === 'all') return true;
    if (!dateStr) return false;

    const orderDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const orderDay = new Date(orderDate);
    orderDay.setHours(0, 0, 0, 0);

    if (filter === 'today') {
      return orderDay.getTime() === today.getTime();
    } else if (filter === 'tomorrow') {
      return orderDay.getTime() === tomorrow.getTime();
    }
    return true;
  };

  // Filtered deliveries based on date (use deliverySchedule for delivery orders)
  const filteredDeliveries = deliveryOrders.filter(order =>
    isDateMatch(order.deliverySchedule, deliveryDateFilter)
  );

  // Filtered pickups based on date (use estimatedPickupDate for pickup orders)
  const filteredPickups = pickupOrders.filter(order =>
    isDateMatch(order.estimatedPickupDate, pickupDateFilter)
  );

  const loadOrders = useCallback(async () => {
    try {
      const allOrders = await api.getOrders();

      // Filter pickup orders
      const pickups = allOrders.filter(order =>
        order.orderType === 'delivery' &&
        ['new_order', 'scheduled_pickup', 'picked_up'].includes(order.status)
      );

      // Filter delivery orders
      const deliveries = allOrders.filter(order =>
        order.orderType === 'delivery' &&
        order.status === 'ready_for_delivery'
      );

      // Always update state to ensure times are refreshed
      setPickupOrders(pickups);
      setDeliveryOrders(deliveries);
    } catch (error) {
      Alert.alert('Error', 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    checkPrinterConnection();
    loadSettings();
  }, [loadOrders]);

  async function loadSettings() {
    try {
      const settingsData = await api.getSettings();
      setSettings(settingsData);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  // Check printer connection on mount
  async function checkPrinterConnection() {
    const name = bluetoothPrinter.getConnectedDeviceName();
    setConnectedDeviceName(name);

    if (!name) {
      const reconnected = await bluetoothPrinter.reconnectSavedPrinter();
      if (reconnected) {
        setConnectedDeviceName(bluetoothPrinter.getConnectedDeviceName());
      }
    }
  }

  async function startScan() {
    setScanning(true);
    setDevices([]);

    await bluetoothPrinter.startScan((foundDevices) => {
      setDevices(foundDevices);
    });

    setTimeout(() => {
      setScanning(false);
    }, 10000);
  }

  function stopScan() {
    bluetoothPrinter.stopScan();
    setScanning(false);
  }

  async function connectToDevice(device: Device) {
    setConnecting(true);
    stopScan();

    const success = await bluetoothPrinter.connect(device);

    if (success) {
      setConnectedDeviceName(device.name || 'Unknown');
      Alert.alert('Connected', `Successfully connected to ${device.name}`);
    } else {
      Alert.alert('Connection Failed', 'Could not connect to the printer. Please try again.');
    }

    setConnecting(false);
  }

  async function disconnectPrinter() {
    await bluetoothPrinter.disconnect();
    setConnectedDeviceName(null);
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

  // Print tag for a specific order - asks for number of bags
  async function printOrderTag(order: Order) {
    if (!bluetoothPrinter.isConnected()) {
      Alert.alert(
        'Printer Not Connected',
        'Please connect a Bluetooth printer first',
        [{ text: 'OK', onPress: () => setShowPrinterModal(true) }]
      );
      return;
    }

    // Prompt for number of bags
    Alert.prompt(
      'Number of Bags',
      `How many bag labels for ${order.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Print',
          onPress: async (bagCountStr) => {
            const bagCount = parseInt(bagCountStr || '1', 10);
            if (isNaN(bagCount) || bagCount < 1) {
              Alert.alert('Invalid', 'Please enter a valid number of bags');
              return;
            }

            setPrintingOrderId(order._id);

            const success = await bluetoothPrinter.printMultipleBagLabels({
              orderId: String(order.orderId),
              customerName: order.customerName,
              customerPhone: formatPhoneNumber(order.customerPhone),
              address: order.customer?.address,
              weight: order.weight,
              isSameDay: order.isSameDay,
            }, bagCount);

            setPrintingOrderId(null);

            if (success) {
              Alert.alert('Success', `${bagCount} tag(s) printed for ${order.customerName}`);
            } else {
              Alert.alert('Print Failed', 'Could not print. Please check printer connection.');
            }
          },
        },
      ],
      'plain-text',
      '1',
      'number-pad'
    );
  }

  // Reload orders when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  // Auto-refresh orders every 10 seconds
  useAutoRefresh(loadOrders);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, [loadOrders]);

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      await api.updateOrderStatus(orderId, newStatus);
      await loadOrders();
      Alert.alert('Success', 'Status updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  }

  // Pickup photo functions
  async function openPhotoCapture(orderId: string) {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to take pickup photos');
        return;
      }
    }
    setPhotoOrderId(orderId);
    setCapturedPhoto(null);
    setShowPhotoModal(true);
  }

  async function takePhoto() {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        // Compress the image
        const compressed = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 1024 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        setCapturedPhoto(compressed.base64 || null);
      }
    } catch (error) {
      console.error('Failed to take photo:', error);
      Alert.alert('Error', 'Failed to capture photo');
    } finally {
      setIsCapturing(false);
    }
  }

  function retakePhoto() {
    setCapturedPhoto(null);
  }

  async function uploadPhotoAndContinue() {
    if (!photoOrderId || !capturedPhoto) return;

    setIsUploading(true);
    try {
      // Upload the photo
      await api.uploadPickupPhoto(photoOrderId, capturedPhoto);

      // Increment count and reset for next photo
      setUploadedPhotoCount(prev => prev + 1);
      setCapturedPhoto(null);
    } catch (error) {
      console.error('Failed to upload photo:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  async function finishPickupWithPhotos() {
    if (!photoOrderId) return;

    // If there's a captured photo that hasn't been uploaded yet, upload it first
    if (capturedPhoto) {
      setIsUploading(true);
      try {
        await api.uploadPickupPhoto(photoOrderId, capturedPhoto);
        setUploadedPhotoCount(prev => prev + 1);
      } catch (error) {
        console.error('Failed to upload final photo:', error);
        Alert.alert('Error', 'Failed to upload photo. Please try again.');
        setIsUploading(false);
        return;
      }
    }

    try {
      // Update the order status
      await api.updateOrderStatus(photoOrderId, 'picked_up');
      await loadOrders();

      const totalPhotos = uploadedPhotoCount + (capturedPhoto ? 1 : 0);

      // Close modal and reset state
      setShowPhotoModal(false);
      setPhotoOrderId(null);
      setCapturedPhoto(null);
      setUploadedPhotoCount(0);

      Alert.alert('Success', `${totalPhotos} photo${totalPhotos > 1 ? 's' : ''} uploaded and order marked as picked up`);
    } catch (error) {
      console.error('Failed to update status:', error);
      Alert.alert('Error', 'Failed to mark order as picked up.');
    } finally {
      setIsUploading(false);
    }
  }

  function closePhotoModal() {
    if (uploadedPhotoCount > 0) {
      Alert.alert(
        'Discard Photos?',
        `You have uploaded ${uploadedPhotoCount} photo${uploadedPhotoCount > 1 ? 's' : ''}. Are you sure you want to cancel without completing the pickup?`,
        [
          { text: 'Keep Taking Photos', style: 'cancel' },
          {
            text: 'Discard & Cancel',
            style: 'destructive',
            onPress: () => {
              setShowPhotoModal(false);
              setPhotoOrderId(null);
              setCapturedPhoto(null);
              setUploadedPhotoCount(0);
            },
          },
        ]
      );
    } else {
      setShowPhotoModal(false);
      setPhotoOrderId(null);
      setCapturedPhoto(null);
      setUploadedPhotoCount(0);
    }
  }

  // Handle pickup - always require photo
  function handlePickupWithPhoto(order: Order) {
    openPhotoCapture(order._id);
  }

  // Handle delivery completion with payment option
  async function handleDeliveryComplete(order: Order) {
    // If order is already paid, just confirm delivery
    if (order.isPaid) {
      Alert.alert(
        'Complete Delivery',
        `Mark order #${order.orderId} as delivered?\n\nTotal: $${(order.totalAmount || 0).toFixed(2)} (Already Paid)`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delivered',
            style: 'default',
            onPress: async () => {
              try {
                await api.updateOrderStatus(order._id, 'completed');
                await loadOrders();
                Alert.alert('Success', 'Order marked as delivered');
              } catch (error) {
                Alert.alert('Error', 'Failed to update status');
              }
            },
          },
        ]
      );
      return;
    }

    // Order not paid - show payment options
    Alert.alert(
      'Complete Delivery',
      `Mark order #${order.orderId} as delivered?\n\nTotal: $${(order.totalAmount || 0).toFixed(2)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delivered (Unpaid)',
          style: 'default',
          onPress: async () => {
            try {
              await api.updateOrderStatus(order._id, 'completed');
              await loadOrders();
              Alert.alert('Success', 'Order marked as delivered');
            } catch (error) {
              Alert.alert('Error', 'Failed to update status');
            }
          },
        },
        {
          text: 'Delivered & Paid',
          style: 'default',
          onPress: () => showPaymentMethodSelection(order),
        },
      ]
    );
  }

  // Show payment method selection - all 4 options
  function showPaymentMethodSelection(order: Order) {
    Alert.alert(
      'Payment Method',
      `Select payment method for $${(order.totalAmount || 0).toFixed(2)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cash',
          onPress: () => completeDeliveryWithPayment(order, 'cash'),
        },
        {
          text: 'Check',
          onPress: () => completeDeliveryWithPayment(order, 'check'),
        },
        {
          text: 'Venmo',
          onPress: () => completeDeliveryWithPayment(order, 'venmo'),
        },
        {
          text: 'Zelle',
          onPress: () => completeDeliveryWithPayment(order, 'zelle'),
        },
      ]
    );
  }

  // Complete delivery and mark as paid with payment method
  async function completeDeliveryWithPayment(order: Order, paymentMethod: string) {
    try {
      await api.updateOrderStatus(order._id, 'completed');
      await api.markOrderAsPaid(order._id, paymentMethod);
      await loadOrders();
      Alert.alert('Success', `Order delivered and paid via ${paymentMethod}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  }

  function openNavigation(address: string, mapApp: MapApp = selectedMapApp) {
    // Clean address to remove apt/unit/floor info for better navigation
    const cleanedAddress = cleanAddressForNavigation(address);
    const encodedAddress = encodeURIComponent(cleanedAddress);

    // Google Maps URLs - use saddr= for current location, daddr= for destination
    const googleMapsAppUrl = `comgooglemaps://?saddr=&daddr=${encodedAddress}&directionsmode=driving`;
    const googleMapsWebUrl = `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${encodedAddress}&travelmode=driving`;

    if (mapApp === 'google') {
      // Try Google Maps app first, fall back to web
      Linking.canOpenURL('comgooglemaps://').then(supported => {
        if (supported) {
          Linking.openURL(googleMapsAppUrl);
        } else {
          Linking.openURL(googleMapsWebUrl);
        }
      });
      return;
    }

    let url = '';
    switch (mapApp) {
      case 'apple':
        url = `maps://maps.apple.com/?saddr=Current+Location&daddr=${encodedAddress}&dirflg=d`;
        break;
      case 'waze':
        url = `waze://?q=${encodedAddress}&navigate=yes`;
        break;
      default:
        Linking.openURL(googleMapsWebUrl);
        return;
    }

    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback to Google Maps web
        Linking.openURL(googleMapsWebUrl);
      }
    });
  }

  // Open route planning modal - uses filtered orders based on date
  function openRoutePlanner() {
    const allOrders = [...filteredPickups, ...filteredDeliveries];
    const stops: RouteStop[] = allOrders
      .filter(order => order.customer?.address)
      .map(order => ({
        order,
        address: order.customer!.address.trim(),
      }));

    if (stops.length === 0) {
      Alert.alert('No Addresses', 'No orders for the selected date have addresses to navigate to.');
      return;
    }

    setRouteStops(stops);
    setShowRouteModal(true);
  }

  // Move stop up in the list
  function moveStopUp(index: number) {
    if (index === 0) return;
    const newStops = [...routeStops];
    [newStops[index - 1], newStops[index]] = [newStops[index], newStops[index - 1]];
    setRouteStops(newStops);
  }

  // Move stop down in the list
  function moveStopDown(index: number) {
    if (index === routeStops.length - 1) return;
    const newStops = [...routeStops];
    [newStops[index], newStops[index + 1]] = [newStops[index + 1], newStops[index]];
    setRouteStops(newStops);
  }

  // Start editing an address
  function startEditAddress(index: number) {
    const stop = routeStops[index];
    setEditingStopIndex(index);
    setEditAddressText(stop.editedAddress || stop.address);
  }

  // Save edited address
  function saveEditedAddress() {
    if (editingStopIndex === null) return;
    const newStops = [...routeStops];
    newStops[editingStopIndex] = {
      ...newStops[editingStopIndex],
      editedAddress: editAddressText.trim(),
    };
    setRouteStops(newStops);
    setEditingStopIndex(null);
    setEditAddressText('');
  }

  // Cancel editing
  function cancelEditAddress() {
    setEditingStopIndex(null);
    setEditAddressText('');
  }

  // Start navigation with selected map app
  async function optimizeRoute() {
    if (routeStops.length < 2) {
      Alert.alert('Info', 'Need at least 2 stops to optimize');
      return;
    }

    setOptimizing(true);
    setRouteStats(null);

    try {
      const stops = routeStops.map(stop => ({
        address: stop.editedAddress || stop.address,
        orderId: stop.order._id,
        customerName: stop.order.customerName,
      }));

      const storeAddress = settings?.storeAddress || undefined;

      const result = await api.optimizeRoute(stops, storeAddress);

      // Reorder routeStops based on optimized order
      const newRouteStops = result.optimizedStops.map(optimizedStop => {
        const originalStop = routeStops.find(s => s.order._id === optimizedStop.orderId);
        return originalStop!;
      }).filter(Boolean);

      setRouteStops(newRouteStops);
      setRouteStats({
        distance: result.totalDistance.text,
        duration: result.totalDuration.text,
      });

      Alert.alert(
        'Route Optimized',
        `Total: ${result.totalDistance.text}, ${result.totalDuration.text}`,
      );
    } catch (error: any) {
      console.error('Route optimization error:', error);

      // Check if there are invalid addresses to fix
      if (error.invalidAddresses && error.invalidAddresses.length > 0) {
        const addressList = error.invalidAddresses
          .map((addr: any) => `• ${addr.customerName || 'Unknown'}: "${addr.address}" - ${addr.reason}`)
          .join('\n');

        Alert.alert(
          'Fix Addresses Required',
          `The following addresses need to be corrected:\n\n${addressList}\n\nPlease update the customer addresses and try again.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Route Optimization Failed', error.message || 'Failed to optimize route');
      }
    } finally {
      setOptimizing(false);
    }
  }

  function startNavigation() {
    // Clean addresses for navigation - remove apt/unit/floor info
    const addresses = routeStops.map(stop =>
      cleanAddressForNavigation(stop.editedAddress || stop.address)
    );

    if (addresses.length === 1) {
      openNavigation(addresses[0]);
      setShowRouteModal(false);
      return;
    }

    const formatAddress = (addr: string) => encodeURIComponent(addr);

    let url = '';

    switch (selectedMapApp) {
      case 'apple':
        // Apple Maps with multiple stops
        const appleAddresses = addresses.map(a => `daddr=${formatAddress(a)}`).join('&');
        url = `maps://maps.apple.com/?${appleAddresses}`;
        break;

      case 'waze':
        // Waze only supports single destination, use first address
        url = `waze://?q=${formatAddress(addresses[0])}&navigate=yes`;
        Alert.alert('Note', 'Waze only supports single destination. Opening first stop.');
        break;

      case 'google':
      default:
        // Google Maps with waypoints
        const origin = formatAddress(addresses[0]);
        const destination = formatAddress(addresses[addresses.length - 1]);
        const waypoints = addresses.slice(1, -1).map(formatAddress).join('%7C');
        url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
        if (waypoints) {
          url += `&waypoints=${waypoints}`;
        }
        break;
    }

    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        // Fallback to Google Maps
        const origin = encodeURIComponent(addresses[0]);
        const destination = encodeURIComponent(addresses[addresses.length - 1]);
        const waypoints = addresses.slice(1, -1).map(encodeURIComponent).join('%7C');
        let fallbackUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
        if (waypoints) {
          fallbackUrl += `&waypoints=${waypoints}`;
        }
        Linking.openURL(fallbackUrl);
      }
    });

    setShowRouteModal(false);
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'new_order': return { bg: '#3b82f6', label: 'New' };
      case 'scheduled_pickup': return { bg: '#f59e0b', label: 'Scheduled' };
      case 'picked_up': return { bg: '#10b981', label: 'Picked Up' };
      case 'ready_for_delivery': return { bg: '#8b5cf6', label: 'Ready' };
      default: return { bg: '#94a3b8', label: status };
    }
  };

  const renderOrderCard = ({ item: order, index }: { item: Order; index: number }) => {
    const statusConfig = getStatusConfig(order.status);
    const isPickup = activeTab === 'pickups';

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.orderNumber}>
              <Text style={styles.orderNumberText}>{index + 1}</Text>
            </View>
            <View>
              <Text style={styles.orderId}>#{order.orderId}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={styles.statusText}>{statusConfig.label}</Text>
          </View>
        </View>

        {/* Customer Info */}
        <View style={styles.customerInfo}>
          <View style={styles.customerNameRow}>
            <Text style={styles.customerName}>{order.customerName}</Text>
            {order.isPaid && (
              <View style={styles.paidBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#fff" />
                <Text style={styles.paidBadgeText}>
                  Paid{order.paymentMethod ? ` - ${formatPaymentMethod(order.paymentMethod)}` : ''}
                </Text>
              </View>
            )}
          </View>
          {order.customer?.address && (
            <Text style={styles.customerAddress}>{order.customer.address}</Text>
          )}
          {order.customer?.buzzerCode && (
            <Text style={styles.buzzerCode}>Buzzer: {order.customer.buzzerCode}</Text>
          )}
          {/* Date + Time Window */}
          {(() => {
            // For pickups use estimatedPickupDate, for deliveries use deliverySchedule
            const rawDate = isPickup ? order.estimatedPickupDate : order.deliverySchedule;
            if (!rawDate) return null;
            const dateTime = formatDateWithTime(rawDate);
            if (!dateTime) return null;
            return (
              <View style={styles.dateTimeRow}>
                <Ionicons name="calendar-outline" size={14} color="#3b82f6" />
                <Text style={styles.dateText}>{dateTime.date}</Text>
                {dateTime.time && (
                  <>
                    <Ionicons name="time-outline" size={14} color="#3b82f6" style={{ marginLeft: 8 }} />
                    <Text style={styles.timeWindowText}>{dateTime.time}</Text>
                  </>
                )}
              </View>
            );
          })()}
        </View>

        {/* Order Info - Only show for deliveries */}
        {!isPickup && (
          <View style={styles.orderInfo}>
            <View style={styles.infoItem}>
              <Ionicons name="scale-outline" size={16} color="#64748b" />
              <Text style={styles.infoText}>{order.weight || 0} lbs</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="cash-outline" size={16} color="#64748b" />
              <Text style={styles.infoText}>${(order.totalAmount || 0).toFixed(2)}</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {order.customer?.address && (
            <TouchableOpacity
              style={[styles.actionButton, styles.navigateButton]}
              onPress={() => openNavigation(order.customer!.address)}
            >
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Navigate</Text>
            </TouchableOpacity>
          )}

          {isPickup ? (
            order.status === 'new_order' || order.status === 'scheduled_pickup' ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.statusButton]}
                onPress={() => handlePickupWithPhoto(order)}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Picked Up</Text>
              </TouchableOpacity>
            ) : order.status === 'picked_up' ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.storeButton]}
                onPress={() => updateStatus(order._id, 'received')}
              >
                <Ionicons name="storefront" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>At Store</Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, styles.statusButton]}
              onPress={() => handleDeliveryComplete(order)}
            >
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Delivered</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Print Tag Button - only show for pickups */}
        {isPickup && (
          <TouchableOpacity
            style={[styles.printTagButton, printingOrderId === order._id && styles.printingButton]}
            onPress={() => printOrderTag(order)}
            disabled={printingOrderId === order._id}
          >
            {printingOrderId === order._id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="pricetag" size={18} color="#fff" />
            )}
            <Text style={styles.printTagButtonText}>
              {printingOrderId === order._id ? 'Printing...' : 'Print Tag'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const activeOrders = activeTab === 'pickups' ? filteredPickups : filteredDeliveries;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header - Compact */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Driver</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pickups' && styles.tabActive]}
          onPress={() => setActiveTab('pickups')}
        >
          <Ionicons
            name="arrow-up-circle"
            size={20}
            color={activeTab === 'pickups' ? '#1e293b' : '#94a3b8'}
          />
          <Text style={[styles.tabText, activeTab === 'pickups' && styles.tabTextActive]}>
            Pickups
          </Text>
          <View style={[styles.tabBadge, activeTab === 'pickups' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, activeTab === 'pickups' && styles.tabBadgeTextActive]}>
              {pickupOrders.length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'deliveries' && styles.tabActive]}
          onPress={() => setActiveTab('deliveries')}
        >
          <Ionicons
            name="arrow-down-circle"
            size={20}
            color={activeTab === 'deliveries' ? '#1e293b' : '#94a3b8'}
          />
          <Text style={[styles.tabText, activeTab === 'deliveries' && styles.tabTextActive]}>
            Deliveries
          </Text>
          <View style={[styles.tabBadge, activeTab === 'deliveries' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, activeTab === 'deliveries' && styles.tabBadgeTextActive]}>
              {deliveryOrders.length}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Date Filter for Pickups */}
      {activeTab === 'pickups' && (
        <View style={styles.dateFilterContainer}>
          <TouchableOpacity
            style={[styles.dateFilterBtn, pickupDateFilter === 'today' && styles.dateFilterBtnActive]}
            onPress={() => setPickupDateFilter('today')}
          >
            <Text style={[styles.dateFilterText, pickupDateFilter === 'today' && styles.dateFilterTextActive]}>
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateFilterBtn, pickupDateFilter === 'tomorrow' && styles.dateFilterBtnActive]}
            onPress={() => setPickupDateFilter('tomorrow')}
          >
            <Text style={[styles.dateFilterText, pickupDateFilter === 'tomorrow' && styles.dateFilterTextActive]}>
              Tomorrow
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateFilterBtn, pickupDateFilter === 'all' && styles.dateFilterBtnActive]}
            onPress={() => setPickupDateFilter('all')}
          >
            <Text style={[styles.dateFilterText, pickupDateFilter === 'all' && styles.dateFilterTextActive]}>
              All ({pickupOrders.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Date Filter for Deliveries */}
      {activeTab === 'deliveries' && (
        <View style={styles.dateFilterContainer}>
          <TouchableOpacity
            style={[styles.dateFilterBtn, deliveryDateFilter === 'today' && styles.dateFilterBtnActive]}
            onPress={() => setDeliveryDateFilter('today')}
          >
            <Text style={[styles.dateFilterText, deliveryDateFilter === 'today' && styles.dateFilterTextActive]}>
              Today
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateFilterBtn, deliveryDateFilter === 'tomorrow' && styles.dateFilterBtnActive]}
            onPress={() => setDeliveryDateFilter('tomorrow')}
          >
            <Text style={[styles.dateFilterText, deliveryDateFilter === 'tomorrow' && styles.dateFilterTextActive]}>
              Tomorrow
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dateFilterBtn, deliveryDateFilter === 'all' && styles.dateFilterBtnActive]}
            onPress={() => setDeliveryDateFilter('all')}
          >
            <Text style={[styles.dateFilterText, deliveryDateFilter === 'all' && styles.dateFilterTextActive]}>
              All ({deliveryOrders.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Compact Printer Button */}
      <TouchableOpacity
        style={styles.printerCompactBtn}
        onPress={() => setShowPrinterModal(true)}
      >
        <Ionicons
          name={connectedDeviceName ? 'print' : 'print-outline'}
          size={18}
          color={connectedDeviceName ? '#10b981' : '#64748b'}
        />
        <Text style={[styles.printerCompactText, connectedDeviceName && styles.printerCompactTextConnected]}>
          {connectedDeviceName || 'Connect Printer'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </TouchableOpacity>

      {/* Optimize Route Button - Shows all pickups + deliveries */}
      {(pickupOrders.length > 0 || deliveryOrders.length > 0) && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBarButton, styles.routeButton]}
            onPress={openRoutePlanner}
          >
            <Ionicons name="map" size={20} color="#fff" />
            <Text style={styles.actionBarButtonText}>
              Plan Route ({filteredPickups.length + filteredDeliveries.length} stops)
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Orders List */}
      <FlatList
        data={activeOrders}
        renderItem={renderOrderCard}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.list}
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyText}>
              No {activeTab === 'pickups' ? 'pickups' : 'deliveries'} available
            </Text>
          </View>
        }
      />

      {/* Route Planning Modal */}
      <Modal
        visible={showRouteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRouteModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Plan Route</Text>
            <TouchableOpacity onPress={() => setShowRouteModal(false)}>
              <Ionicons name="close" size={28} color="#1e293b" />
            </TouchableOpacity>
          </View>

          {/* Map App Selection */}
          <View style={styles.mapAppSection}>
            <Text style={styles.mapAppLabel}>Select Map App:</Text>
            <View style={styles.mapAppButtons}>
              <TouchableOpacity
                style={[styles.mapAppBtn, selectedMapApp === 'google' && styles.mapAppBtnActive]}
                onPress={() => setSelectedMapApp('google')}
              >
                <Text style={[styles.mapAppBtnText, selectedMapApp === 'google' && styles.mapAppBtnTextActive]}>
                  Google Maps
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapAppBtn, selectedMapApp === 'apple' && styles.mapAppBtnActive]}
                onPress={() => setSelectedMapApp('apple')}
              >
                <Text style={[styles.mapAppBtnText, selectedMapApp === 'apple' && styles.mapAppBtnTextActive]}>
                  Apple Maps
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapAppBtn, selectedMapApp === 'waze' && styles.mapAppBtnActive]}
                onPress={() => setSelectedMapApp('waze')}
              >
                <Text style={[styles.mapAppBtnText, selectedMapApp === 'waze' && styles.mapAppBtnTextActive]}>
                  Waze
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Optimize Route Button */}
          <TouchableOpacity
            style={[styles.optimizeBtn, optimizing && styles.optimizeBtnDisabled]}
            onPress={optimizeRoute}
            disabled={optimizing || routeStops.length < 2}
          >
            {optimizing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="git-branch" size={20} color="#fff" />
            )}
            <Text style={styles.optimizeBtnText}>
              {optimizing ? 'Optimizing...' : 'Optimize Route'}
            </Text>
          </TouchableOpacity>

          {/* Route Stats */}
          {routeStats && (
            <View style={styles.routeStats}>
              <View style={styles.routeStatItem}>
                <Ionicons name="speedometer" size={16} color="#10b981" />
                <Text style={styles.routeStatText}>{routeStats.distance}</Text>
              </View>
              <View style={styles.routeStatItem}>
                <Ionicons name="time" size={16} color="#3b82f6" />
                <Text style={styles.routeStatText}>{routeStats.duration}</Text>
              </View>
            </View>
          )}

          <Text style={styles.stopsLabel}>Stops ({routeStops.length}) - Drag to reorder:</Text>

          {/* Stops List */}
          <KeyboardAwareScrollView bottomOffset={50} style={styles.stopsList}>
            {routeStops.map((stop, index) => (
              <View key={stop.order._id} style={styles.stopItem}>
                <View style={styles.stopNumber}>
                  <Text style={styles.stopNumberText}>{index + 1}</Text>
                </View>

                <View style={styles.stopContent}>
                  <View style={styles.stopCustomerRow}>
                    <Text style={styles.stopCustomer}>#{stop.order.orderId} - {stop.order.customerName}</Text>
                    {(() => {
                      // For pickups use estimatedPickupDate, for deliveries use deliverySchedule
                      const isPickupOrder = ['new_order', 'scheduled_pickup', 'picked_up'].includes(stop.order.status);
                      const timeStr = isPickupOrder
                        ? formatTimeWithFrames(stop.order.estimatedPickupDate)
                        : formatTimeWithFrames(stop.order.deliverySchedule);
                      return timeStr ? (
                        <View style={styles.stopTimeWindow}>
                          <Ionicons name="time-outline" size={12} color="#3b82f6" />
                          <Text style={styles.stopTimeText}>{timeStr}</Text>
                        </View>
                      ) : null;
                    })()}
                  </View>
                  {editingStopIndex === index ? (
                    <View style={styles.editAddressContainer}>
                      <TextInput
                        style={styles.editAddressInput}
                        value={editAddressText}
                        onChangeText={setEditAddressText}
                        placeholder="Enter address"
                        autoFocus
                      />
                      <View style={styles.editAddressButtons}>
                        <TouchableOpacity style={styles.saveAddressBtn} onPress={saveEditedAddress}>
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cancelAddressBtn} onPress={cancelEditAddress}>
                          <Ionicons name="close" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => startEditAddress(index)}>
                      <Text style={[styles.stopAddress, stop.editedAddress && styles.stopAddressEdited]}>
                        {stop.editedAddress || stop.address}
                        <Text style={styles.editHint}> (tap to edit)</Text>
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.stopActions}>
                  <TouchableOpacity
                    style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}
                    onPress={() => moveStopUp(index)}
                    disabled={index === 0}
                  >
                    <Ionicons name="chevron-up" size={24} color={index === 0 ? '#cbd5e1' : '#1e293b'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.moveBtn, index === routeStops.length - 1 && styles.moveBtnDisabled]}
                    onPress={() => moveStopDown(index)}
                    disabled={index === routeStops.length - 1}
                  >
                    <Ionicons name="chevron-down" size={24} color={index === routeStops.length - 1 ? '#cbd5e1' : '#1e293b'} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </KeyboardAwareScrollView>

          {/* Start Navigation Button */}
          <TouchableOpacity style={styles.startNavBtn} onPress={startNavigation}>
            <Ionicons name="navigate" size={24} color="#fff" />
            <Text style={styles.startNavBtnText}>Start Navigation</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Bluetooth Printer Modal */}
      <Modal
        visible={showPrinterModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPrinterModal(false)}
      >
        <View style={styles.printerModalOverlay}>
          <View style={styles.printerModalContent}>
            <View style={styles.printerModalHeader}>
              <Text style={styles.printerModalTitle}>Bluetooth Printer</Text>
              <TouchableOpacity onPress={() => setShowPrinterModal(false)}>
                <Ionicons name="close" size={24} color="#1e293b" />
              </TouchableOpacity>
            </View>

            {connectedDeviceName ? (
              <View style={styles.printerModalConnected}>
                <View style={styles.connectedPrinterInfo}>
                  <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  <Text style={styles.connectedPrinterName}>{connectedDeviceName}</Text>
                </View>
                <View style={styles.connectedPrinterActions}>
                  <TouchableOpacity
                    style={[styles.printerActionBtn, styles.testPrintBtn]}
                    onPress={testPrint}
                  >
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                    <Text style={styles.printerActionBtnText}>Test</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.printerActionBtn, styles.disconnectBtn]}
                    onPress={disconnectPrinter}
                  >
                    <Ionicons name="close-circle-outline" size={16} color="#fff" />
                    <Text style={styles.printerActionBtnText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.printerModalScan}>
                <TouchableOpacity
                  style={[styles.scanBtn, scanning && styles.scanBtnActive]}
                  onPress={scanning ? stopScan : startScan}
                  disabled={connecting}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="bluetooth" size={20} color="#fff" />
                  )}
                  <Text style={styles.scanBtnText}>
                    {scanning ? 'Scanning...' : 'Scan for Printers'}
                  </Text>
                </TouchableOpacity>

                {connecting && (
                  <View style={styles.connectingRow}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.connectingText}>Connecting...</Text>
                  </View>
                )}

                {devices.length > 0 && (
                  <ScrollView style={styles.devicesList} nestedScrollEnabled={true}>
                    {devices.map((device) => (
                      <TouchableOpacity
                        key={device.id}
                        style={styles.deviceItem}
                        onPress={() => connectToDevice(device)}
                        disabled={connecting}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="print-outline" size={20} color="#1e293b" />
                        <View style={styles.deviceInfo}>
                          <Text style={styles.deviceName}>{device.name || 'Unknown'}</Text>
                          <Text style={styles.deviceId}>{device.id}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {!scanning && devices.length === 0 && (
                  <Text style={styles.printerHint}>
                    Make sure your printer is turned on and in pairing mode
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Pickup Photo Modal */}
      <Modal
        visible={showPhotoModal}
        animationType="slide"
        onRequestClose={closePhotoModal}
      >
        <View style={styles.photoModalContainer}>
          <View style={styles.photoModalHeader}>
            <Text style={styles.photoModalTitle}>
              Pickup Photos {uploadedPhotoCount > 0 && `(${uploadedPhotoCount} saved)`}
            </Text>
            <TouchableOpacity onPress={closePhotoModal} style={styles.photoCloseBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {capturedPhoto ? (
            // Preview captured photo
            <View style={[styles.photoPreviewContainer, { paddingBottom: insets.bottom + 20 }]}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${capturedPhoto}` }}
                style={[styles.photoPreview, { transform: [{ scaleX: -1 }] }]}
                resizeMode="contain"
              />
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={retakePhoto}
                  disabled={isUploading}
                >
                  <Ionicons name="camera-reverse" size={20} color="#fff" />
                  <Text style={styles.photoActionText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addAnotherBtn, isUploading && styles.confirmBtnDisabled]}
                  onPress={uploadPhotoAndContinue}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="add-circle" size={20} color="#fff" />
                  )}
                  <Text style={styles.photoActionText}>
                    {isUploading ? 'Saving...' : 'Add'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, isUploading && styles.confirmBtnDisabled]}
                  onPress={finishPickupWithPhotos}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                  <Text style={styles.photoActionText}>
                    {isUploading ? 'Done...' : 'Done'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Camera view
            <View style={styles.cameraContainer}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
              />
              <View style={styles.cameraOverlay}>
                <View style={styles.cameraFrame} />
                <Text style={styles.cameraHint}>
                  {uploadedPhotoCount === 0
                    ? 'Take a photo of the bags'
                    : `${uploadedPhotoCount} photo${uploadedPhotoCount > 1 ? 's' : ''} saved - take another or tap Done`}
                </Text>
              </View>
              <View style={styles.captureContainer}>
                {uploadedPhotoCount > 0 && (
                  <TouchableOpacity
                    style={styles.doneFloatingBtn}
                    onPress={finishPickupWithPhotos}
                  >
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={styles.doneFloatingText}>Done ({uploadedPhotoCount})</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.captureBtn, isCapturing && styles.captureBtnDisabled]}
                  onPress={takePhoto}
                  disabled={isCapturing}
                >
                  {isCapturing ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={40} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
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
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  tabActive: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1e293b',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#1e293b',
  },
  tabBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeActive: {
    backgroundColor: '#1e293b',
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabBadgeTextActive: {
    color: '#fff',
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  list: {
    padding: 12,
    paddingTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  orderId: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  customerInfo: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  paidBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  customerPhone: {
    fontSize: 14,
    color: '#2563eb',
    marginTop: 4,
  },
  customerAddress: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
  },
  buzzerCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f59e0b',
    marginTop: 4,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  timeWindowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  timeWindowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  orderInfo: {
    flexDirection: 'row',
    padding: 12,
    gap: 20,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#64748b',
  },
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  navigateButton: {
    backgroundColor: '#2563eb',
  },
  callButton: {
    backgroundColor: '#10b981',
  },
  statusButton: {
    backgroundColor: '#10b981',
  },
  storeButton: {
    backgroundColor: '#6366f1',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 16,
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  actionBarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBarButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  routeButton: {
    backgroundColor: '#2563eb',
  },
  printButton: {
    backgroundColor: '#8b5cf6',
  },
  // Print Tag Button
  printTagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingVertical: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
  },
  printingButton: {
    backgroundColor: '#a78bfa',
  },
  printTagButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Compact Printer Button
  printerCompactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  printerCompactText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  printerCompactTextConnected: {
    color: '#10b981',
  },
  // Printer Modal
  printerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  printerModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  printerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  printerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  printerModalConnected: {
    padding: 16,
  },
  printerModalScan: {
    padding: 16,
  },
  connectedPrinter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectedPrinterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedPrinterName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  connectedPrinterActions: {
    flexDirection: 'row',
    gap: 8,
  },
  printerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  printerActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  testPrintBtn: {
    backgroundColor: '#2563eb',
  },
  disconnectBtn: {
    backgroundColor: '#ef4444',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
  },
  scanBtnActive: {
    backgroundColor: '#f59e0b',
  },
  scanBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  connectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  connectingText: {
    fontSize: 14,
    color: '#2563eb',
  },
  devicesList: {
    marginTop: 12,
    maxHeight: 250,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginBottom: 8,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  deviceId: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  printerHint: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
  },
  // Route Planning Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  mapAppSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
  },
  mapAppLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
  },
  mapAppButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  mapAppBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  mapAppBtnActive: {
    backgroundColor: '#2563eb',
  },
  mapAppBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  mapAppBtnTextActive: {
    color: '#fff',
  },
  stopsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stopsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    gap: 12,
  },
  stopNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  stopContent: {
    flex: 1,
  },
  stopCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  stopCustomer: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  stopTimeWindow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  stopTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
  },
  stopAddress: {
    fontSize: 13,
    color: '#64748b',
  },
  stopAddressEdited: {
    color: '#2563eb',
    fontStyle: 'italic',
  },
  editHint: {
    fontSize: 11,
    color: '#94a3b8',
  },
  stopActions: {
    flexDirection: 'column',
    gap: 4,
  },
  moveBtn: {
    padding: 4,
  },
  moveBtnDisabled: {
    opacity: 0.3,
  },
  editAddressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  editAddressInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  editAddressButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  saveAddressBtn: {
    backgroundColor: '#10b981',
    padding: 8,
    borderRadius: 8,
  },
  cancelAddressBtn: {
    backgroundColor: '#ef4444',
    padding: 8,
    borderRadius: 8,
  },
  startNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  startNavBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  optimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8b5cf6',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
  },
  optimizeBtnDisabled: {
    opacity: 0.6,
  },
  optimizeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 12,
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
  },
  routeStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeStatText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  // Date filter styles
  dateFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  dateFilterBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  dateFilterBtnActive: {
    backgroundColor: '#2563eb',
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  dateFilterTextActive: {
    color: '#fff',
  },
  // Pickup Photo Modal styles
  photoModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  photoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  photoModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  photoCloseBtn: {
    padding: 8,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFrame: {
    width: 280,
    height: 280,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  cameraHint: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  captureContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureBtnDisabled: {
    backgroundColor: '#64748b',
  },
  photoPreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  photoPreview: {
    width: '100%',
    height: '70%',
    borderRadius: 16,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#64748b',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  addAnotherBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  photoActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  doneFloatingBtn: {
    position: 'absolute',
    top: -60,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  doneFloatingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
