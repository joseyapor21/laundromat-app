import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
  Platform,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../services/api';
import { formatPhoneNumber, formatPhoneInput } from '../../utils/phoneFormat';
import type { Order, Customer, PaymentMethod } from '../../types';

interface ExtraItem {
  _id: string;
  name: string;
  price: number; // Price per unit
  minimumPrice?: number; // Minimum charge
  unitType?: 'lb' | 'item' | 'each' | 'flat'; // How price is calculated
  category?: string; // 'service' or 'product'
  perWeightUnit?: number;
  isActive: boolean;
  allowMultiplePrices?: boolean;
}

interface Settings {
  minimumWeight: number;
  minimumPrice: number;
  pricePerPound: number;
  sameDayBasePrice?: number;
  sameDayWeightThreshold?: number;
  sameDayPricePerPound?: number;
}

interface Bag {
  identifier: string;
  weight: number;
  color?: string;
  description?: string;
}

interface Location {
  _id: string;
  name: string;
  code?: string;
}

interface POSViewProps {
  orders: Order[];
  onOrderCreated: () => void;
  onExit: () => void;
  onOpenOrder: (orderId: string) => void;
  currentLocation: Location | null;
  availableLocations: Location[];
  onSelectLocation: (location: Location) => Promise<void>;
  initialCustomer?: Customer | null;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', color: '#10b981' },
  { value: 'venmo', label: 'Venmo', color: '#3b82f6' },
  { value: 'zelle', label: 'Zelle', color: '#2563eb' },
  { value: 'check', label: 'Check', color: '#6b7280' },
];

const STATUS_GROUPS = {
  new_order: ['new_order', 'received', 'scheduled_pickup', 'picked_up'],
  processing: ['in_washer', 'in_dryer', 'laid_on_cart', 'folding', 'folded'],
  ready: ['ready_for_pickup', 'ready_for_delivery'],
};

const BAG_COLORS = [
  { value: 'white', label: 'White', hex: '#f1f5f9', border: '#cbd5e1' },
  { value: 'black', label: 'Black', hex: '#1e293b', border: '#1e293b' },
  { value: 'blue', label: 'Blue', hex: '#3b82f6', border: '#3b82f6' },
  { value: 'red', label: 'Red', hex: '#ef4444', border: '#ef4444' },
  { value: 'green', label: 'Green', hex: '#22c55e', border: '#22c55e' },
  { value: 'yellow', label: 'Yellow', hex: '#eab308', border: '#eab308' },
];

export default function POSView({
  orders,
  onOrderCreated,
  onExit,
  onOpenOrder,
  currentLocation,
  availableLocations,
  onSelectLocation,
  initialCustomer,
}: POSViewProps) {
  // Screen dimensions for responsive layout
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isPortrait = height > width || width < 600;
  // Phone landscape: not portrait but height is limited (< 500) or width < 1000
  const isPhoneLandscape = !isPortrait && (height < 500 || width < 1000);
  const isTabletLandscape = !isPortrait && !isPhoneLandscape;

  // Store selector state
  const [showStoreSelector, setShowStoreSelector] = useState(false);

  // Customer state
  const [customers, setCustomers] = useState<Customer[]>([]); // All customers for current store
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);

  // Set initial customer from caller ID popup
  useEffect(() => {
    if (initialCustomer) {
      setSelectedCustomer(initialCustomer);
    }
  }, [initialCustomer]);

  // Order state
  const [bags, setBags] = useState<Bag[]>([]);
  const [weightInput, setWeightInput] = useState('');
  const [selectedColor, setSelectedColor] = useState('white');
  const [colorInput, setColorInput] = useState('');
  const [bagDescription, setBagDescription] = useState('');
  const [extraItemSearch, setExtraItemSearch] = useState('');
  const [selectedExtraItems, setSelectedExtraItems] = useState<Record<string, { quantity: number; price: number }>>({});
  // Multi-instance extra items (same item with different prices)
  const [extraItemInstances, setExtraItemInstances] = useState<Array<{
    instanceId: string;
    itemId: string;
    itemName: string;
    quantity: number;
    price: number;
  }>>([]);
  const [showAddInstanceModal, setShowAddInstanceModal] = useState(false);
  const [selectedItemForInstance, setSelectedItemForInstance] = useState<ExtraItem | null>(null);
  const [instancePrice, setInstancePrice] = useState('');
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [showFullExtraItemsModal, setShowFullExtraItemsModal] = useState(false);
  const [isSameDay, setIsSameDay] = useState(false);
  const [separationType, setSeparationType] = useState<'none' | 'wash_only' | 'all_the_way'>('none');
  const [showSeparationModal, setShowSeparationModal] = useState(false);
  const [notes, setNotes] = useState('');

  // Order type
  const [orderType, setOrderType] = useState<'storePickup' | 'delivery'>('storePickup');
  const [deliveryType, setDeliveryType] = useState<'full' | 'pickupOnly' | 'deliveryOnly'>('full');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');

  // Pickup/Delivery date
  const getDefaultPickupDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(17, 0, 0, 0);
    return date;
  };
  const [dropOffDate, setDropOffDate] = useState<Date>(new Date()); // When customer drops off
  const [pickupDate, setPickupDate] = useState<Date>(getDefaultPickupDate()); // When order is ready
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('4-6PM');
  const [useExactTime, setUseExactTime] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Payment
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [applyCredit, setApplyCredit] = useState(false);

  // Quick add customer
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [quickAddAddress, setQuickAddAddress] = useState('');
  const [quickAddCreating, setQuickAddCreating] = useState(false);

  // Data state
  const [settings, setSettings] = useState<Settings | null>(null);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);

  // Active orders state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showActiveOrdersModal, setShowActiveOrdersModal] = useState(false);

  // Loading state
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load settings, extra items, and customers for current store
  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsData, extraItemsData] = await Promise.all([
          api.getSettings(),
          api.getExtraItems(),
        ]);
        setSettings(settingsData);
        setExtraItems(extraItemsData.filter((item: ExtraItem) => item.isActive));
      } catch (error) {
        console.error('Failed to load POS data:', error);
      } finally {
        setInitialLoading(false);
      }
      // Load customers separately (don't block POS)
      try {
        const customersData = await api.getCustomers();
        console.log('POS loaded customers:', customersData.length);
        setCustomers(customersData);
      } catch (error) {
        console.error('Failed to load customers:', error);
      }
    };
    loadData();
  }, []);

  // Reload customers when store changes
  const loadCustomers = async () => {
    setIsLoadingCustomers(true);
    try {
      const customersData = await api.getCustomers();
      console.log('POS reloaded customers for store:', customersData.length);
      setCustomers(customersData);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setIsLoadingCustomers(false);
    }
  };

  // Filter customers locally based on search (same as CreateOrderScreen)
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phoneNumber.includes(customerSearch)
  );

  // Calculate total weight
  const totalWeight = bags.reduce((sum, bag) => sum + (bag.weight || 0), 0);

  // Round to quarter helper
  const roundToQuarter = (value: number): number => Math.round(value * 4) / 4;

  // Calculate price
  const calculateTotalPrice = useCallback((): number => {
    if (!settings || totalWeight <= 0) return 0;

    let basePrice = 0;
    if (isSameDay) {
      const sameDayBase = settings.sameDayBasePrice ?? 12;
      const threshold = settings.sameDayWeightThreshold ?? 7;
      const pricePerPound = settings.sameDayPricePerPound ?? 1.60;
      basePrice = totalWeight <= threshold ? sameDayBase : sameDayBase + ((totalWeight - threshold) * pricePerPound);
    } else {
      const minWeight = settings.minimumWeight || 8;
      const pricePerPound = settings.pricePerPound || 1.25;
      const minPrice = settings.minimumPrice || 8;
      basePrice = totalWeight <= minWeight ? minPrice : roundToQuarter(minPrice + ((totalWeight - minWeight) * pricePerPound));
    }

    // Add extra items with new pricing structure
    Object.entries(selectedExtraItems).forEach(([itemId, data]) => {
      if (data.quantity > 0) {
        const item = extraItems.find(i => i._id === itemId);
        if (!item) return;

        let itemTotal = 0;
        const unitType = item.unitType || 'lb';
        const minimumPrice = item.minimumPrice || 0;

        if (unitType === 'lb') {
          // Price per pound - multiply by weight
          const perWeightUnit = item.perWeightUnit || 1;
          itemTotal = (totalWeight / perWeightUnit) * data.price;
        } else if (unitType === 'item' || unitType === 'each') {
          // Price per item/each - multiply by quantity
          itemTotal = data.price * data.quantity;
        } else if (unitType === 'flat') {
          // Flat rate - just the price
          itemTotal = data.price;
        }

        // Apply minimum price if set
        if (minimumPrice > 0 && itemTotal < minimumPrice) {
          itemTotal = minimumPrice;
        }

        basePrice += itemTotal;
      }
    });

    // Add multi-instance extra items
    extraItemInstances.forEach(instance => {
      basePrice += instance.price * instance.quantity;
    });

    return basePrice;
  }, [settings, totalWeight, isSameDay, selectedExtraItems, extraItems, extraItemInstances]);

  // Numpad handler
  const handleNumpad = (key: string) => {
    if (key === 'C') {
      setWeightInput('');
    } else {
      setWeightInput(prev => prev + key);
    }
  };

  // Add bag
  const addBag = () => {
    const weight = parseFloat(weightInput) || 0;
    if (weight <= 0) {
      Alert.alert('Enter Weight', 'Please enter a weight using the numpad');
      return;
    }
    // Use typed color if provided, otherwise use selected color
    const bagColor = colorInput.trim() || selectedColor;
    setBags(prev => [...prev, {
      identifier: `Bag ${prev.length + 1}`,
      weight,
      color: bagColor,
      description: bagDescription.trim(),
    }]);
    setWeightInput('');
    setColorInput('');
    setBagDescription('');
  };

  // Remove bag
  const removeBag = (index: number) => {
    setBags(prev => prev.filter((_, i) => i !== index));
  };

  // Toggle extra item
  const toggleExtraItem = (item: ExtraItem) => {
    const isSelected = selectedExtraItems[item._id] !== undefined;
    if (isSelected) {
      setSelectedExtraItems(prev => {
        const { [item._id]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setSelectedExtraItems(prev => ({
        ...prev,
        [item._id]: { quantity: 1, price: item.price },
      }));
    }
  };

  // Add extra item instance with custom price
  const addExtraItemInstance = () => {
    if (!selectedItemForInstance) return;
    const price = parseFloat(instancePrice) || selectedItemForInstance.price;

    if (editingInstanceId) {
      // Edit existing instance
      setExtraItemInstances(prev =>
        prev.map(i =>
          i.instanceId === editingInstanceId ? { ...i, price } : i
        )
      );
      setEditingInstanceId(null);
    } else {
      // Add new instance
      setExtraItemInstances(prev => [
        ...prev,
        {
          instanceId: `${selectedItemForInstance._id}-${Date.now()}`,
          itemId: selectedItemForInstance._id,
          itemName: selectedItemForInstance.name,
          quantity: 1,
          price,
        },
      ]);
    }
    setInstancePrice('');
  };

  // Edit existing instance
  const editInstance = (instance: typeof extraItemInstances[0]) => {
    const item = extraItems.find(e => e._id === instance.itemId);
    if (item) {
      setSelectedItemForInstance(item);
      setInstancePrice(instance.price.toString());
      setEditingInstanceId(instance.instanceId);
      setShowAddInstanceModal(true);
    }
  };

  // Remove extra item instance
  const removeExtraItemInstance = (instanceId: string) => {
    setExtraItemInstances(prev => prev.filter(i => i.instanceId !== instanceId));
  };

  // Update instance quantity
  const updateInstanceQuantity = (instanceId: string, delta: number) => {
    setExtraItemInstances(prev =>
      prev.map(i =>
        i.instanceId === instanceId
          ? { ...i, quantity: Math.max(1, i.quantity + delta) }
          : i
      )
    );
  };

  // Open add instance modal
  const openAddInstanceModal = (item: ExtraItem) => {
    setSelectedItemForInstance(item);
    setInstancePrice(item.price.toString());
    setShowAddInstanceModal(true);
  };

  // Clear form
  const clearForm = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setBags([]);
    setWeightInput('');
    setSelectedColor('white');
    setColorInput('');
    setBagDescription('');
    setExtraItemSearch('');
    setSelectedExtraItems({});
    setExtraItemInstances([]);
    setIsSameDay(false);
    setSeparationType('none');
    setNotes('');
    setOrderType('storePickup');
    setDeliveryType('full');
    setDeliveryAddress('');
    setDeliveryFee('');
    setDropOffDate(new Date());
    setPickupDate(getDefaultPickupDate());
    setSelectedTimeSlot('4-6PM');
    setMarkAsPaid(false);
    setPaymentMethod('cash');
    setApplyCredit(false);
    setSelectedOrder(null);
  };

  // Quick add customer
  const handleQuickAddCustomer = async () => {
    if (!quickAddName.trim()) {
      Alert.alert('Error', 'Please enter customer name');
      return;
    }
    if (!quickAddPhone.trim()) {
      Alert.alert('Error', 'Please enter phone number');
      return;
    }

    const cleanPhone = quickAddPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    setQuickAddCreating(true);
    try {
      const newCustomer = await api.createCustomer({
        name: quickAddName.trim(),
        phoneNumber: formatPhoneNumber(quickAddPhone),
        address: quickAddAddress.trim() || undefined,
      });

      // Add new customer to local list
      setCustomers(prev => [newCustomer, ...prev]);
      setSelectedCustomer(newCustomer);
      setShowQuickAddCustomer(false);
      setQuickAddName('');
      setQuickAddPhone('');
      setQuickAddAddress('');
      setCustomerSearch('');

      Alert.alert('Success', `Customer "${newCustomer.name}" created!`);
    } catch (error) {
      console.error('Failed to create customer:', error);
      Alert.alert('Error', 'Failed to create customer');
    } finally {
      setQuickAddCreating(false);
    }
  };

  // Calculate delivery fee
  const getDeliveryFeeAmount = (): number => {
    if (orderType !== 'delivery') return 0;
    let fee = 0;
    if (deliveryFee) {
      fee = parseFloat(deliveryFee) || 0;
    } else if (selectedCustomer?.deliveryFee) {
      fee = parseFloat(selectedCustomer.deliveryFee.replace('$', '')) || 0;
    }
    // Half price for pickup only or delivery only
    if (deliveryType === 'pickupOnly' || deliveryType === 'deliveryOnly') {
      fee = fee / 2;
    }
    return fee;
  };

  // Calculate credit to apply
  const getCreditToApply = (): number => {
    if (!applyCredit || !selectedCustomer?.credit) return 0;
    const total = calculateTotalPrice() + getDeliveryFeeAmount();
    return Math.min(selectedCustomer.credit, total);
  };

  // Create order
  const createOrder = async () => {
    if (!selectedCustomer) {
      Alert.alert('Select Customer', 'Please search and select a customer');
      return;
    }
    if (bags.length === 0) {
      Alert.alert('Add Bags', 'Please add at least one bag with weight');
      return;
    }

    setLoading(true);
    try {
      const extraItemsData = Object.entries(selectedExtraItems)
        .filter(([_, data]) => data.quantity > 0)
        .map(([itemId, data]) => {
          const item = extraItems.find(e => e._id === itemId);
          if (!item) return null;

          let totalPrice = 0;
          const unitType = item.unitType || 'lb';
          const minimumPrice = item.minimumPrice || 0;

          if (unitType === 'lb') {
            // Price per pound - multiply by weight
            const perWeightUnit = item.perWeightUnit || 1;
            totalPrice = roundToQuarter((totalWeight / perWeightUnit) * data.price);
          } else if (unitType === 'item' || unitType === 'each') {
            // Price per item/each - multiply by quantity
            totalPrice = data.price * data.quantity;
          } else if (unitType === 'flat') {
            // Flat rate - just the price
            totalPrice = data.price;
          }

          // Apply minimum price if set
          if (minimumPrice > 0 && totalPrice < minimumPrice) {
            totalPrice = minimumPrice;
          }

          return { itemId, name: item.name || '', price: totalPrice, quantity: 1 };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Add multi-instance extra items
      extraItemInstances.forEach(instance => {
        extraItemsData.push({
          itemId: instance.itemId,
          name: instance.itemName,
          price: instance.price,
          quantity: instance.quantity,
        });
      });

      const deliveryFeeAmount = getDeliveryFeeAmount();
      const creditApplied = getCreditToApply();
      const finalTotal = calculateTotalPrice() + deliveryFeeAmount - creditApplied;

      await api.createOrder({
        customerId: selectedCustomer.id?.toString() || selectedCustomer._id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phoneNumber,
        orderType,
        deliveryType: orderType === 'delivery' ? deliveryType : undefined,
        deliveryAddress: orderType === 'delivery' ? (deliveryAddress || selectedCustomer.address) : undefined,
        deliveryFee: deliveryFeeAmount,
        status: 'new_order',
        totalAmount: finalTotal,
        weight: totalWeight,
        bags,
        items: [],
        extraItems: extraItemsData,
        dropOffDate: dropOffDate.toISOString(),
        estimatedPickupDate: pickupDate.toISOString(),
        deliverySchedule: (orderType === 'delivery' && (deliveryType === 'full' || deliveryType === 'deliveryOnly')) ? pickupDate.toISOString() : undefined,
        specialInstructions: notes + (separationType === 'wash_only' ? '\n[SEPARATE WASH]' : separationType === 'all_the_way' ? '\n[SEPARATE ALL THE WAY]' : ''),
        isPaid: markAsPaid,
        paymentMethod: markAsPaid ? paymentMethod : undefined,
        paidAt: markAsPaid ? new Date().toISOString() : undefined,
        isSameDay,
        creditApplied,
      });

      Alert.alert('Success', 'Order created successfully!');
      clearForm();
      onOrderCreated();
    } catch (error) {
      console.error('Failed to create order:', error);
      Alert.alert('Error', 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  // Mark order as paid
  const markOrderPaid = async (paymentMethod: string) => {
    if (!selectedOrder) return;
    setLoading(true);
    try {
      await api.updateOrder(selectedOrder._id, {
        isPaid: true,
        paymentMethod,
        paidAt: new Date().toISOString(),
      });
      Alert.alert('Success', `Order #${selectedOrder.orderId} marked as paid`);
      setSelectedOrder(null);
      onOrderCreated();
    } catch (error) {
      Alert.alert('Error', 'Failed to update payment');
    } finally {
      setLoading(false);
    }
  };

  // Filter active orders
  const activeOrders = orders.filter(o => !['completed', 'archived'].includes(o.status));
  const newOrders = activeOrders.filter(o => STATUS_GROUPS.new_order.includes(o.status));
  const processingOrders = activeOrders.filter(o => STATUS_GROUPS.processing.includes(o.status));
  const readyOrders = activeOrders.filter(o => STATUS_GROUPS.ready.includes(o.status));

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading POS...</Text>
      </View>
    );
  }

  return (
    <View style={[
      styles.container,
      {
        paddingTop: isPhoneLandscape ? Math.min(insets.top, 8) : insets.top,
        paddingBottom: isPhoneLandscape ? 0 : insets.bottom,
        paddingLeft: isPhoneLandscape ? insets.left : 0,
        paddingRight: isPhoneLandscape ? insets.right : 0,
      }
    ]}>
      {/* Full screen mode */}
      <StatusBar barStyle="light-content" backgroundColor="#2563eb" />

      {/* Header */}
      <View style={[styles.header, isPhoneLandscape && styles.headerCompact]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, isPhoneLandscape && styles.headerTitleCompact]}>POS</Text>
        </View>
        {/* Store selector - always visible when multiple locations */}
        {availableLocations.length > 1 ? (
          <TouchableOpacity
            style={styles.storeButton}
            onPress={() => setShowStoreSelector(true)}
          >
            <Ionicons name="storefront" size={18} color="#fff" />
            <Text style={styles.storeButtonText} numberOfLines={1}>
              {currentLocation?.name || 'Select Store'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#fff" />
          </TouchableOpacity>
        ) : currentLocation && (
          <Text style={[styles.headerStoreName, isPhoneLandscape && styles.headerStoreNameCompact]} numberOfLines={1}>@ {currentLocation.name}</Text>
        )}
        <TouchableOpacity style={[styles.exitButton, isPhoneLandscape && styles.exitButtonCompact]} onPress={onExit}>
          <Ionicons name="close" size={isPhoneLandscape ? 18 : 22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.content, (isPortrait || isPhoneLandscape) && styles.contentPortrait]}>
        {/* 3-Column Layout for Tablet Landscape Only */}
        {isTabletLandscape ? (
          <View style={styles.tabletLayout}>
            {/* LEFT COLUMN: Customer + Options */}
            <View style={styles.tabletColumnLeft}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabletColumnContent}>
              {/* Customer Search */}
              <View style={styles.tabletSection}>
                <Text style={styles.tabletSectionTitle}>Customer</Text>
                <TextInput
                  style={styles.tabletInput}
                  placeholder="Search customer..."
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  placeholderTextColor="#94a3b8"
                />
                {customerSearch.length > 0 && !selectedCustomer && (
                  <View style={styles.tabletSearchResults}>
                    {filteredCustomers.slice(0, 5).map(customer => (
                      <TouchableOpacity
                        key={customer._id}
                        style={styles.tabletCustomerResult}
                        onPress={() => {
                          setSelectedCustomer(customer);
                          setCustomerSearch('');
                          if (customer.notes) setNotes(customer.notes);
                          if (customer.address) setDeliveryAddress(customer.address);
                        }}
                      >
                        <Text style={styles.tabletCustomerName}>{customer.name}</Text>
                        <Text style={styles.tabletCustomerPhone}>{formatPhoneNumber(customer.phoneNumber)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {selectedCustomer && (
                  <View style={styles.tabletSelectedCustomer}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tabletSelectedName}>{selectedCustomer.name}</Text>
                      <Text style={styles.tabletSelectedPhone}>{formatPhoneNumber(selectedCustomer.phoneNumber)}</Text>
                      {(selectedCustomer.credit || 0) > 0 && (
                        <Text style={styles.tabletCredit}>${(selectedCustomer.credit || 0).toFixed(2)} credit</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => { setSelectedCustomer(null); setCustomerSearch(''); }}>
                      <Ionicons name="close-circle" size={28} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Order Type */}
              <View style={styles.tabletSection}>
                <View style={styles.tabletOrderTypeRow}>
                  <TouchableOpacity
                    style={[styles.tabletOrderTypeBtn, orderType === 'storePickup' && styles.tabletOrderTypeBtnActive]}
                    onPress={() => setOrderType('storePickup')}
                  >
                    <Ionicons name="storefront" size={20} color={orderType === 'storePickup' ? '#fff' : '#64748b'} />
                    <Text style={[styles.tabletOrderTypeText, orderType === 'storePickup' && styles.tabletOrderTypeTextActive]}>Pickup</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tabletOrderTypeBtn, orderType === 'delivery' && styles.tabletOrderTypeBtnActive]}
                    onPress={() => setOrderType('delivery')}
                  >
                    <Ionicons name="car" size={20} color={orderType === 'delivery' ? '#fff' : '#64748b'} />
                    <Text style={[styles.tabletOrderTypeText, orderType === 'delivery' && styles.tabletOrderTypeTextActive]}>Delivery</Text>
                  </TouchableOpacity>
                </View>
                {orderType === 'delivery' && selectedCustomer && (
                  <View style={styles.tabletDeliveryInfo}>
                    <TextInput
                      style={styles.tabletInput}
                      placeholder="Delivery address..."
                      value={deliveryAddress}
                      onChangeText={setDeliveryAddress}
                      placeholderTextColor="#94a3b8"
                    />
                    <View style={styles.tabletDeliveryFeeRow}>
                      <Text style={styles.tabletLabel}>Fee: $</Text>
                      <TextInput
                        style={styles.tabletFeeInput}
                        placeholder="0"
                        value={deliveryFee}
                        onChangeText={setDeliveryFee}
                        keyboardType="decimal-pad"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>
                  </View>
                )}
                {/* Delivery Service Type - always show when delivery selected */}
                {orderType === 'delivery' && (
                  <View style={styles.deliveryTypeSection}>
                    <Text style={styles.deliveryTypeLabel}>Delivery Service Type:</Text>
                    <View style={styles.deliveryTypeRow}>
                      <TouchableOpacity
                        style={[styles.deliveryTypeBtn, deliveryType === 'full' && styles.deliveryTypeBtnActive]}
                        onPress={() => setDeliveryType('full')}
                      >
                        <Ionicons name="swap-horizontal" size={18} color={deliveryType === 'full' ? '#fff' : '#64748b'} />
                        <Text style={[styles.deliveryTypeText, deliveryType === 'full' && styles.deliveryTypeTextActive]}>Full Service</Text>
                        <Text style={[styles.deliveryTypePrice, deliveryType === 'full' && styles.deliveryTypePriceActive]}>
                          ${(parseFloat(selectedCustomer?.deliveryFee?.replace('$', '') || deliveryFee || '0') || 0).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.deliveryTypeBtn, deliveryType === 'pickupOnly' && styles.deliveryTypeBtnActive]}
                        onPress={() => setDeliveryType('pickupOnly')}
                      >
                        <Ionicons name="arrow-up" size={18} color={deliveryType === 'pickupOnly' ? '#fff' : '#64748b'} />
                        <Text style={[styles.deliveryTypeText, deliveryType === 'pickupOnly' && styles.deliveryTypeTextActive]}>Pickup Only</Text>
                        <Text style={[styles.deliveryTypePrice, deliveryType === 'pickupOnly' && styles.deliveryTypePriceActive]}>
                          ${((parseFloat(selectedCustomer?.deliveryFee?.replace('$', '') || deliveryFee || '0') || 0) / 2).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.deliveryTypeBtn, deliveryType === 'deliveryOnly' && styles.deliveryTypeBtnActive]}
                        onPress={() => setDeliveryType('deliveryOnly')}
                      >
                        <Ionicons name="arrow-down" size={18} color={deliveryType === 'deliveryOnly' ? '#fff' : '#64748b'} />
                        <Text style={[styles.deliveryTypeText, deliveryType === 'deliveryOnly' && styles.deliveryTypeTextActive]}>Delivery Only</Text>
                        <Text style={[styles.deliveryTypePrice, deliveryType === 'deliveryOnly' && styles.deliveryTypePriceActive]}>
                          ${((parseFloat(selectedCustomer?.deliveryFee?.replace('$', '') || deliveryFee || '0') || 0) / 2).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* Options Row */}
              <View style={styles.tabletOptionsRow}>
                <TouchableOpacity
                  style={[styles.tabletOptionBtn, isSameDay && styles.tabletOptionBtnYellow]}
                  onPress={() => setIsSameDay(!isSameDay)}
                >
                  <Ionicons name="flash" size={18} color={isSameDay ? '#fff' : '#f59e0b'} />
                  <Text style={[styles.tabletOptionText, isSameDay && styles.tabletOptionTextActive]}>Same Day</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabletOptionBtn, separationType !== 'none' && styles.tabletOptionBtnBlue]}
                  onPress={() => setShowSeparationModal(true)}
                >
                  <Ionicons name="git-branch" size={18} color={separationType !== 'none' ? '#fff' : '#3b82f6'} />
                  <Text style={[styles.tabletOptionText, separationType !== 'none' && styles.tabletOptionTextActive]}>
                    {separationType === 'wash_only' ? 'Sep Wash' : separationType === 'all_the_way' ? 'Sep All' : 'Separated'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.tabletExtrasBtn}
                  onPress={() => setShowFullExtraItemsModal(true)}
                >
                  <Ionicons name="add-circle" size={18} color="#2563eb" />
                  <Text style={styles.tabletExtrasBtnText}>
                    Extras {(Object.keys(selectedExtraItems).length + extraItemInstances.length) > 0 && `(${Object.keys(selectedExtraItems).length + extraItemInstances.length})`}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <TextInput
                style={styles.tabletNotesInput}
                placeholder="Notes..."
                value={notes}
                onChangeText={setNotes}
                placeholderTextColor="#94a3b8"
                multiline
              />
              </ScrollView>
            </View>

            {/* MIDDLE COLUMN: Numpad + Bags */}
            <View style={styles.tabletColumnMiddle}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabletColumnContentCenter}>
              <View style={styles.tabletWeightDisplay}>
                <Text style={styles.tabletWeightLabel}>Weight</Text>
                <Text style={styles.tabletWeightValue}>{weightInput || '0'} lbs</Text>
              </View>
              <View style={styles.tabletNumpad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'C'].map(key => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tabletNumpadKey, key === 'C' && styles.tabletNumpadKeyClear]}
                    onPress={() => handleNumpad(key)}
                  >
                    <Text style={[styles.tabletNumpadKeyText, key === 'C' && styles.tabletNumpadKeyTextClear]}>{key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Bag Colors + Description */}
              <View style={styles.tabletBagSection}>
                <View style={styles.tabletColorRow}>
                  {BAG_COLORS.map(color => (
                    <TouchableOpacity
                      key={color.value}
                      style={[
                        styles.tabletColorBtn,
                        { backgroundColor: color.hex, borderColor: color.border },
                        selectedColor === color.value && styles.tabletColorBtnSelected,
                      ]}
                      onPress={() => { setSelectedColor(color.value); setColorInput(''); }}
                    >
                      {selectedColor === color.value && (
                        <Ionicons name="checkmark" size={16} color={color.value === 'white' || color.value === 'yellow' ? '#1e293b' : '#fff'} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.tabletCustomColorInput}
                  placeholder="Custom color..."
                  value={colorInput}
                  onChangeText={(text) => {
                    setColorInput(text);
                    if (text.trim()) setSelectedColor(text.trim());
                  }}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  style={styles.tabletBagDescInput}
                  placeholder="Special instructions..."
                  value={bagDescription}
                  onChangeText={setBagDescription}
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity style={styles.tabletAddBagBtn} onPress={addBag}>
                  <Ionicons name="add" size={22} color="#fff" />
                  <Text style={styles.tabletAddBagText}>Add Bag</Text>
                </TouchableOpacity>
              </View>
              {/* Bags List - Enhanced */}
              {bags.length > 0 && (
                <View style={styles.tabletBagsListEnhanced}>
                  {bags.map((bag, index) => {
                    const colorInfo = BAG_COLORS.find(c => c.value === bag.color);
                    const dotColor = colorInfo ? colorInfo.hex : '#94a3b8';
                    const colorName = colorInfo ? colorInfo.label : bag.color || 'Unknown';
                    return (
                      <View key={index} style={styles.tabletBagItemEnhanced}>
                        <View style={[styles.tabletBagDotLarge, { backgroundColor: dotColor, borderColor: colorInfo?.border || '#cbd5e1' }]} />
                        <View style={styles.tabletBagInfo}>
                          <Text style={styles.tabletBagWeight}>{bag.weight} lbs</Text>
                          <Text style={styles.tabletBagColor}>{colorName} bag</Text>
                          {bag.description && <Text style={styles.tabletBagDesc}>{bag.description}</Text>}
                        </View>
                        <TouchableOpacity style={styles.tabletBagRemove} onPress={() => removeBag(index)}>
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  <View style={styles.tabletBagsTotalRow}>
                    <Text style={styles.tabletBagsTotalLabel}>{bags.length} bag{bags.length > 1 ? 's' : ''}</Text>
                    <Text style={styles.tabletBagsTotalWeight}>{totalWeight} lbs total</Text>
                  </View>
                </View>
              )}
              </ScrollView>
            </View>

            {/* RIGHT COLUMN: Dates + Payment + Total + Create */}
            <View style={styles.tabletColumnRight}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabletColumnContent}>
              {/* Pickup Date - only for delivery orders */}
              {orderType === 'delivery' && (
                <View style={styles.tabletSection}>
                  <Text style={styles.tabletSectionTitle}>Pickup Date</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() + i);
                      const isSelected = dropOffDate.toDateString() === date.toDateString();
                      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[styles.tabletDateBtnSmall, isSelected && styles.tabletDateBtnSelected]}
                          onPress={() => {
                            const newDate = new Date();
                            newDate.setDate(newDate.getDate() + i);
                            setDropOffDate(newDate);
                          }}
                        >
                          <Text style={[styles.tabletDateDaySmall, isSelected && styles.tabletDateTextSelected]}>
                            {i === 0 ? 'Today' : dayNames[date.getDay()]}
                          </Text>
                          <Text style={[styles.tabletDateNumSmall, isSelected && styles.tabletDateTextSelected]}>{date.getDate()}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Ready By / Delivery Date */}
              <View style={styles.tabletSection}>
                <Text style={styles.tabletSectionTitle}>{orderType === 'delivery' ? 'Delivery Date' : 'Ready By'}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {Array.from({ length: 30 }, (_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() + i);
                    const isSelected = pickupDate.toDateString() === date.toDateString();
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[styles.tabletDateBtnSmall, isSelected && styles.tabletDateBtnSelected]}
                        onPress={() => {
                          const newDate = new Date();
                          newDate.setDate(newDate.getDate() + i);
                          newDate.setHours(pickupDate.getHours(), pickupDate.getMinutes());
                          setPickupDate(newDate);
                        }}
                      >
                        <Text style={[styles.tabletDateDaySmall, isSelected && styles.tabletDateTextSelected]}>
                          {i === 0 ? 'Today' : dayNames[date.getDay()]}
                        </Text>
                        <Text style={[styles.tabletDateNumSmall, isSelected && styles.tabletDateTextSelected]}>{date.getDate()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabletTimeRow}>
                  {['10-11AM', '11-12PM', '10-12PM', '4-5PM', '5-6PM', '4-6PM'].map(slot => (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.tabletTimeBtn, !useExactTime && selectedTimeSlot === slot && styles.tabletTimeBtnSelected]}
                      onPress={() => { setUseExactTime(false); setSelectedTimeSlot(slot); }}
                    >
                      <Text style={[styles.tabletTimeText, !useExactTime && selectedTimeSlot === slot && styles.tabletTimeTextSelected]}>{slot}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.tabletExactTimeBtn, useExactTime && styles.tabletExactTimeBtnActive]}
                  onPress={() => { setUseExactTime(true); setShowTimePicker(true); }}
                >
                  <Ionicons name="time-outline" size={18} color={useExactTime ? '#fff' : '#2563eb'} />
                  <Text style={[styles.tabletExactTimeText, useExactTime && styles.tabletExactTimeTextActive]}>
                    {useExactTime ? pickupDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Custom Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Payment */}
              <View style={styles.tabletSection}>
                <View style={styles.tabletPaymentRow}>
                  <Text style={styles.tabletLabel}>Mark Paid</Text>
                  <Switch value={markAsPaid} onValueChange={setMarkAsPaid} />
                </View>
                {markAsPaid && (
                  <>
                    <View style={styles.tabletPaymentMethods}>
                      {PAYMENT_METHODS.map(method => (
                        <TouchableOpacity
                          key={method.value}
                          style={[styles.tabletPaymentBtn, paymentMethod === method.value && { backgroundColor: method.color }]}
                          onPress={() => setPaymentMethod(method.value as PaymentMethod)}
                        >
                          <Text style={[styles.tabletPaymentText, paymentMethod === method.value && { color: '#fff' }]}>{method.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                {selectedCustomer && (selectedCustomer.credit || 0) > 0 && (
                  <View style={styles.tabletCreditRow}>
                    <Text style={styles.tabletCreditLabel}>Apply ${(selectedCustomer.credit || 0).toFixed(2)} credit</Text>
                    <Switch value={applyCredit} onValueChange={setApplyCredit} />
                  </View>
                )}
              </View>

              {/* Total */}
              <View style={styles.tabletTotalSection}>
                <View style={styles.tabletTotalRow}>
                  <Text style={styles.tabletTotalLabel}>Subtotal</Text>
                  <Text style={styles.tabletSubtotal}>${calculateTotalPrice().toFixed(2)}</Text>
                </View>
                {orderType === 'delivery' && getDeliveryFeeAmount() > 0 && (
                  <View style={styles.tabletTotalRow}>
                    <Text style={styles.tabletTotalLabel}>Delivery</Text>
                    <Text style={styles.tabletSubtotal}>${getDeliveryFeeAmount().toFixed(2)}</Text>
                  </View>
                )}
                {applyCredit && getCreditToApply() > 0 && (
                  <View style={styles.tabletTotalRow}>
                    <Text style={styles.tabletCreditApplied}>Credit</Text>
                    <Text style={styles.tabletCreditApplied}>-${getCreditToApply().toFixed(2)}</Text>
                  </View>
                )}
                <View style={styles.tabletGrandTotalRow}>
                  <Text style={styles.tabletGrandTotalLabel}>Total</Text>
                  <Text style={styles.tabletGrandTotal}>${(calculateTotalPrice() + getDeliveryFeeAmount() - getCreditToApply()).toFixed(2)}</Text>
                </View>
              </View>

              {/* Create Button */}
              <TouchableOpacity
                style={[styles.tabletCreateBtn, loading && styles.createButtonDisabled]}
                onPress={createOrder}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={styles.tabletCreateText}>Create Order</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.tabletClearBtn} onPress={clearForm}>
                <Text style={styles.tabletClearText}>Clear</Text>
              </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        ) : (
        /* Portrait / Phone Landscape Layout */
        <ScrollView
          style={styles.leftPanelPortrait}
          contentContainerStyle={styles.leftPanelPortraitContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Row: Customer + Order Type */}
          <View>
            {/* Customer Search */}
            <View style={styles.sectionCompact}>
              <View style={styles.customerSectionHeader}>
                <Text style={styles.sectionTitleSmall}>Customer</Text>
                {currentLocation && (
                  <Text style={styles.storeFilterLabelSmall}>@ {currentLocation.name}</Text>
                )}
              </View>
              <TextInput
                style={styles.searchInputCompact}
                placeholder={`Search customer...`}
                value={customerSearch}
                onChangeText={setCustomerSearch}
                placeholderTextColor="#94a3b8"
              />
              {isLoadingCustomers && <ActivityIndicator size="small" color="#2563eb" />}
              {customerSearch.length > 0 && !selectedCustomer && (
                <ScrollView style={styles.searchResultsCompact} nestedScrollEnabled>
                  {filteredCustomers.slice(0, 4).map(customer => (
                    <TouchableOpacity
                      key={customer._id}
                      style={styles.customerResultCompact}
                      onPress={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearch('');
                        if (customer.notes) setNotes(customer.notes);
                        if (customer.address) setDeliveryAddress(customer.address);
                      }}
                    >
                      <Text style={styles.customerNameCompact}>{customer.name}</Text>
                      <Text style={styles.customerPhoneCompact}>{formatPhoneNumber(customer.phoneNumber)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {!selectedCustomer && customerSearch.length > 0 && filteredCustomers.length === 0 && !isLoadingCustomers && (
                <TouchableOpacity style={styles.quickAddButtonCompact} onPress={() => setShowQuickAddCustomer(true)}>
                  <Ionicons name="person-add" size={16} color="#fff" />
                  <Text style={styles.quickAddButtonTextCompact}>Add New</Text>
                </TouchableOpacity>
              )}
              {selectedCustomer && (
                <View style={styles.selectedCustomerCompact}>
                  <View style={styles.selectedCustomerInfoCompact}>
                    <Text style={styles.selectedCustomerNameCompact}>{selectedCustomer.name}</Text>
                    <Text style={styles.selectedCustomerPhoneCompact}>{formatPhoneNumber(selectedCustomer.phoneNumber)}</Text>
                    {(selectedCustomer.credit || 0) > 0 && (
                      <Text style={styles.customerCreditCompact}>${(selectedCustomer.credit || 0).toFixed(2)} credit</Text>
                    )}
                    {orderType === 'delivery' && (
                      <>
                        <View style={styles.customerAddressRowCompact}>
                          <Ionicons name="location" size={12} color="#2563eb" />
                          <TextInput
                            style={styles.customerAddressInputCompact}
                            placeholder="Delivery address..."
                            value={deliveryAddress}
                            onChangeText={setDeliveryAddress}
                            placeholderTextColor="#94a3b8"
                          />
                        </View>
                        <View style={styles.customerDeliveryFeeRowCompact}>
                          <Text style={styles.deliveryFeeInlineLabelCompact}>Fee: $</Text>
                          <TextInput
                            style={styles.deliveryFeeInlineInputCompact}
                            placeholder={selectedCustomer?.deliveryFee?.replace('$', '') || '0'}
                            value={deliveryFee}
                            onChangeText={setDeliveryFee}
                            keyboardType="decimal-pad"
                            placeholderTextColor="#94a3b8"
                          />
                        </View>
                      </>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedCustomer(null); setCustomerSearch(''); }}>
                    <Ionicons name="close-circle" size={24} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Order Type */}
            <View style={styles.sectionCompact}>
              <Text style={styles.sectionTitleSmall}>Order Type</Text>
              <View style={styles.orderTypeRowCompact}>
                <TouchableOpacity
                  style={[styles.orderTypeButtonCompact, orderType === 'storePickup' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('storePickup')}
                >
                  <Ionicons name="storefront" size={16} color={orderType === 'storePickup' ? '#fff' : '#64748b'} />
                  <Text style={[styles.orderTypeTextCompact, orderType === 'storePickup' && styles.orderTypeTextActive]}>Pickup</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orderTypeButtonCompact, orderType === 'delivery' && styles.orderTypeButtonActive]}
                  onPress={() => setOrderType('delivery')}
                >
                  <Ionicons name="car" size={16} color={orderType === 'delivery' ? '#fff' : '#64748b'} />
                  <Text style={[styles.orderTypeTextCompact, orderType === 'delivery' && styles.orderTypeTextActive]}>Delivery</Text>
                </TouchableOpacity>
              </View>
              {/* Options Row */}
              <View style={styles.optionsRowCompact}>
                <TouchableOpacity
                  style={[styles.optionButtonCompact, isSameDay && styles.optionButtonActiveYellow]}
                  onPress={() => setIsSameDay(!isSameDay)}
                >
                  <Ionicons name="flash" size={14} color={isSameDay ? '#fff' : '#f59e0b'} />
                  <Text style={[styles.optionTextCompact, isSameDay && styles.optionTextActiveCompact]}>Same Day</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.optionButtonCompact, separationType !== 'none' && styles.optionButtonActiveBlue]}
                  onPress={() => setShowSeparationModal(true)}
                >
                  <Ionicons name="git-branch" size={14} color={separationType !== 'none' ? '#fff' : '#3b82f6'} />
                  <Text style={[styles.optionTextCompact, separationType !== 'none' && styles.optionTextActiveCompact]}>
                    {separationType === 'wash_only' ? 'Sep Wash' : separationType === 'all_the_way' ? 'Sep All' : 'Separated'}
                  </Text>
                </TouchableOpacity>
                {extraItems.length > 0 && (
                  <TouchableOpacity
                    style={styles.extrasButtonCompact}
                    onPress={() => setShowFullExtraItemsModal(true)}
                  >
                    <Ionicons name="add-circle" size={14} color="#2563eb" />
                    <Text style={styles.extrasButtonTextCompact}>
                      Extras{(Object.keys(selectedExtraItems).length + extraItemInstances.length) > 0 &&
                        ` (${Object.keys(selectedExtraItems).length + extraItemInstances.length})`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Middle Row: Weight/Numpad + Bag Info + Date */}
          <View style={!isPortrait ? styles.middleRowLandscape : undefined}>
            {/* Weight & Numpad */}
            <View style={[styles.sectionCompact, !isPortrait && { flex: 1 }]}>
              <View style={styles.weightRowCompact}>
                <View style={styles.weightDisplayCompact}>
                  <Text style={styles.weightLabelCompact}>Weight</Text>
                  <Text style={styles.weightValueCompact}>{weightInput || '0'} lbs</Text>
                </View>
                <View style={styles.numpadCompact}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'C'].map(key => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.numpadKeyCompact, key === 'C' && styles.numpadKeyClearCompact]}
                      onPress={() => handleNumpad(key)}
                    >
                      <Text style={[styles.numpadKeyTextCompact, key === 'C' && styles.numpadKeyTextClear]}>{key}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Bag Color & Add */}
            <View style={[styles.sectionCompact, !isPortrait && { flex: 1 }]}>
              <View style={styles.bagSectionCompact}>
                <View style={styles.colorButtonsCompact}>
                  {BAG_COLORS.map(color => (
                    <TouchableOpacity
                      key={color.value}
                      style={[
                        styles.colorButtonCompact,
                        { backgroundColor: color.hex, borderColor: color.border },
                        selectedColor === color.value && !colorInput && styles.colorButtonSelectedCompact,
                      ]}
                      onPress={() => { setSelectedColor(color.value); setColorInput(''); }}
                    >
                      {selectedColor === color.value && !colorInput && (
                        <Ionicons name="checkmark" size={14} color={color.value === 'white' || color.value === 'yellow' ? '#1e293b' : '#fff'} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.customColorInputCompact}
                  placeholder="Custom color..."
                  value={colorInput}
                  onChangeText={(text) => {
                    setColorInput(text);
                    if (text.trim()) setSelectedColor(text.trim());
                  }}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  style={styles.bagDescInputCompact}
                  placeholder="Special instructions..."
                  value={bagDescription}
                  onChangeText={setBagDescription}
                  placeholderTextColor="#94a3b8"
                />
                <TouchableOpacity style={styles.addBagButtonCompact} onPress={addBag}>
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addBagButtonTextCompact}>Add Bag</Text>
                </TouchableOpacity>
              </View>
              {bags.length > 0 && (
                <View style={styles.bagsListCompact}>
                  {bags.map((bag, index) => {
                    const colorInfo = BAG_COLORS.find(c => c.value === bag.color);
                    const dotColor = colorInfo ? colorInfo.hex : '#94a3b8';
                    return (
                      <View key={index} style={styles.bagItemCompact}>
                        <View style={[styles.bagColorDotCompact, { backgroundColor: dotColor }]} />
                        <Text style={styles.bagTextCompact}>{bag.weight}lb</Text>
                        <TouchableOpacity onPress={() => removeBag(index)}>
                          <Ionicons name="close" size={14} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  <Text style={styles.totalWeightCompact}>{totalWeight} lbs</Text>
                </View>
              )}
            </View>

            {/* Date & Notes */}
            <View style={[styles.sectionCompact, !isPortrait && { flex: 1 }]}>
              <Text style={styles.sectionTitleSmall}>{orderType === 'delivery' ? 'Delivery' : 'Ready By'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekCalendarCompact}>
              {Array.from({ length: 30 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() + i);
                const isSelected = pickupDate.toDateString() === date.toDateString();
                const isToday = i === 0;
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.calendarDay,
                      isSelected && styles.calendarDaySelected,
                      isToday && !isSelected && styles.calendarDayToday,
                    ]}
                    onPress={() => {
                      const newDate = new Date();
                      newDate.setDate(newDate.getDate() + i);
                      newDate.setHours(pickupDate.getHours(), pickupDate.getMinutes());
                      setPickupDate(newDate);
                    }}
                  >
                    <Text style={[styles.calendarDayName, isSelected && styles.calendarDayTextSelected]}>
                      {isToday ? 'Today' : dayNames[date.getDay()]}
                    </Text>
                    <Text style={[styles.calendarDayNumber, isSelected && styles.calendarDayTextSelected]}>
                      {date.getDate()}
                    </Text>
                    <Text style={[styles.calendarMonth, isSelected && styles.calendarDayTextSelected]}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Time Slots - Compact */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeSlotsCompact}>
              {['10-11AM', '11-12PM', '10-12PM', '4-5PM', '5-6PM', '4-6PM'].map(slot => (
                <TouchableOpacity
                  key={slot}
                  style={[styles.timeSlotButtonCompact, !useExactTime && selectedTimeSlot === slot && styles.timeSlotActiveCompact]}
                  onPress={() => {
                    setUseExactTime(false);
                    setSelectedTimeSlot(slot);
                  }}
                >
                  <Text style={[styles.timeSlotTextCompact, !useExactTime && selectedTimeSlot === slot && styles.timeSlotTextActiveCompact]}>{slot}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.timeSlotButtonCompact, useExactTime && styles.exactTimeButtonActiveCompact]}
                onPress={() => {
                  setUseExactTime(true);
                  setShowTimePicker(true);
                }}
              >
                <Ionicons name="time" size={12} color={useExactTime ? '#fff' : '#2563eb'} />
                <Text style={[styles.timeSlotTextCompact, useExactTime && styles.timeSlotTextActiveCompact]}>
                  {useExactTime ? pickupDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Custom'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
            {/* Notes inline */}
            <TextInput
              style={styles.notesInputCompact}
              placeholder="Notes..."
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor="#94a3b8"
            />
            </View>
          </View>

          {/* Bottom Row: Payment + Total + Create */}
          <View style={styles.bottomRowLandscape}>
            {/* Payment */}
            <View style={styles.paymentSectionCompact}>
              <View style={styles.paymentToggleRowCompact}>
                <Text style={styles.paymentLabelCompact}>Paid</Text>
                <Switch value={markAsPaid} onValueChange={setMarkAsPaid} />
              </View>
              {markAsPaid && (
                <>
                  <View style={styles.paymentMethodsRowCompact}>
                    {PAYMENT_METHODS.map(method => (
                      <TouchableOpacity
                        key={method.value}
                        style={[styles.paymentMethodButtonCompact, paymentMethod === method.value && { backgroundColor: method.color }]}
                        onPress={() => setPaymentMethod(method.value as PaymentMethod)}
                      >
                        <Text style={[styles.paymentMethodTextCompact, paymentMethod === method.value && { color: '#fff' }]}>{method.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {selectedCustomer && (selectedCustomer.credit || 0) > 0 && (
                <View style={styles.creditRowCompact}>
                  <Text style={styles.creditLabelCompact}>Credit ${(selectedCustomer.credit || 0).toFixed(2)}</Text>
                  <Switch value={applyCredit} onValueChange={setApplyCredit} />
                </View>
              )}
            </View>

            {/* Total */}
            <View style={styles.totalSectionCompact}>
              <View style={styles.totalRowCompact}>
                <Text style={styles.totalLabelCompact}>Subtotal</Text>
                <Text style={styles.subtotalAmountCompact}>${calculateTotalPrice().toFixed(2)}</Text>
              </View>
              {orderType === 'delivery' && getDeliveryFeeAmount() > 0 && (
                <View style={styles.totalRowCompact}>
                  <Text style={styles.totalLabelCompact}>Delivery</Text>
                  <Text style={styles.subtotalAmountCompact}>${getDeliveryFeeAmount().toFixed(2)}</Text>
                </View>
              )}
              {applyCredit && getCreditToApply() > 0 && (
                <View style={styles.totalRowCompact}>
                  <Text style={styles.creditAppliedLabelCompact}>Credit</Text>
                  <Text style={styles.creditAppliedAmountCompact}>-${getCreditToApply().toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.totalRowCompact}>
                <Text style={styles.grandTotalLabelCompact}>Total</Text>
                <Text style={styles.totalAmountCompact}>${(calculateTotalPrice() + getDeliveryFeeAmount() - getCreditToApply()).toFixed(2)}</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsSectionCompact}>
              <TouchableOpacity
                style={[styles.createButtonCompact, loading && styles.createButtonDisabled]}
                onPress={createOrder}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color="#fff" />
                    <Text style={styles.createButtonTextCompact}>Create Order</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.clearButtonCompact} onPress={clearForm}>
                <Text style={styles.clearButtonTextCompact}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
        )}
      </View>


      {/* Quick Add Customer Modal */}
      <Modal visible={showQuickAddCustomer} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Customer</Text>
              <TouchableOpacity onPress={() => setShowQuickAddCustomer(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Customer Name *"
              value={quickAddName}
              onChangeText={setQuickAddName}
              placeholderTextColor="#94a3b8"
              autoFocus
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Phone Number *"
              value={quickAddPhone}
              onChangeText={(text) => setQuickAddPhone(formatPhoneInput(text))}
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Address (optional)"
              value={quickAddAddress}
              onChangeText={setQuickAddAddress}
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity
              style={[styles.modalButton, quickAddCreating && { opacity: 0.6 }]}
              onPress={handleQuickAddCustomer}
              disabled={quickAddCreating}
            >
              {quickAddCreating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>Create Customer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.timePickerOverlay}
          activeOpacity={1}
          onPress={() => setShowTimePicker(false)}
        >
          <View style={styles.timePickerContent}>
            <View style={styles.timePickerHeader}>
              <Text style={styles.timePickerTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={pickupDate}
              mode="time"
              display="spinner"
              onChange={(event, date) => {
                if (date) {
                  const newDate = new Date(pickupDate);
                  newDate.setHours(date.getHours(), date.getMinutes());
                  setPickupDate(newDate);
                }
              }}
            />
            <TouchableOpacity
              style={styles.timePickerDoneButton}
              onPress={() => setShowTimePicker(false)}
            >
              <Text style={styles.timePickerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Full Extra Items Modal */}
      <Modal visible={showFullExtraItemsModal} animationType="slide" transparent>
        <View style={styles.fullExtrasModalOverlay}>
          <View style={styles.fullExtrasModalContent}>
            <View style={styles.fullExtrasModalHeader}>
              <Text style={styles.fullExtrasModalTitle}>Select Extra Items</Text>
              <TouchableOpacity onPress={() => setShowFullExtraItemsModal(false)}>
                <Ionicons name="close" size={28} color="#1e293b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.fullExtrasModalScroll}>
              {extraItems.map(item => {
                const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                const isSelected = selectedExtraItems[item._id] !== undefined;
                const data = selectedExtraItems[item._id] || { quantity: 0, price: item.price };
                const quantity = data.quantity;
                const instanceCount = extraItemInstances.filter(i => i.itemId === item._id).length;

                return (
                  <View key={item._id} style={[styles.fullExtrasModalItem, (isSelected || instanceCount > 0) && styles.fullExtrasModalItemSelected]}>
                    <View style={styles.fullExtrasModalItemInfo}>
                      <Text style={styles.fullExtrasModalItemName}>{item.name}</Text>
                      <Text style={styles.fullExtrasModalItemPrice}>
                        ${item.price.toFixed(2)}{isWeightBased ? ` per ${item.perWeightUnit} lbs` : ''}
                      </Text>
                    </View>

                    {isWeightBased ? (
                      // Weight-based items use a toggle switch
                      <Switch
                        value={isSelected}
                        onValueChange={(enabled) => {
                          if (enabled) {
                            setSelectedExtraItems(prev => ({
                              ...prev,
                              [item._id]: { quantity: 1, price: item.price }
                            }));
                          } else {
                            setSelectedExtraItems(prev => {
                              const { [item._id]: _, ...rest } = prev;
                              return rest;
                            });
                          }
                        }}
                        trackColor={{ false: '#e2e8f0', true: '#c4b5fd' }}
                        thumbColor={isSelected ? '#2563eb' : '#f4f4f5'}
                      />
                    ) : item.allowMultiplePrices ? (
                      // Items with multiple prices - button to add with custom prices
                      <TouchableOpacity
                        style={styles.fullExtrasAddMultipleBtn}
                        onPress={() => {
                          setShowFullExtraItemsModal(false);
                          setTimeout(() => openAddInstanceModal(item), 300);
                        }}
                      >
                        <Ionicons name="add-circle" size={20} color="#2563eb" />
                        <Text style={styles.fullExtrasAddMultipleBtnText}>
                          {instanceCount > 0 ? `${instanceCount} added` : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      // Regular items use +/- quantity controls
                      <View style={styles.fullExtrasQuantityControl}>
                        <TouchableOpacity
                          style={[styles.fullExtrasQtyBtn, quantity === 0 && styles.fullExtrasQtyBtnDisabled]}
                          onPress={() => {
                            if (quantity > 0) {
                              const newQty = quantity - 1;
                              if (newQty === 0) {
                                setSelectedExtraItems(prev => {
                                  const { [item._id]: _, ...rest } = prev;
                                  return rest;
                                });
                              } else {
                                setSelectedExtraItems(prev => ({
                                  ...prev,
                                  [item._id]: { ...prev[item._id], quantity: newQty }
                                }));
                              }
                            }
                          }}
                          disabled={quantity === 0}
                        >
                          <Ionicons name="remove" size={20} color={quantity === 0 ? '#94a3b8' : '#2563eb'} />
                        </TouchableOpacity>
                        <Text style={styles.fullExtrasQtyText}>{quantity}</Text>
                        <TouchableOpacity
                          style={styles.fullExtrasQtyBtn}
                          onPress={() => {
                            setSelectedExtraItems(prev => ({
                              ...prev,
                              [item._id]: { quantity: (prev[item._id]?.quantity || 0) + 1, price: item.price }
                            }));
                          }}
                        >
                          <Ionicons name="add" size={20} color="#2563eb" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {/* Show instances for allowMultiplePrices items */}
            {extraItemInstances.length > 0 && (
              <View style={styles.fullExtrasInstancesSection}>
                <Text style={styles.fullExtrasInstancesTitle}>Added Items:</Text>
                {extraItemInstances.map(instance => (
                  <View key={instance.instanceId} style={styles.fullExtrasInstanceRow}>
                    <Text style={styles.fullExtrasInstanceName}>{instance.itemName}</Text>
                    <Text style={styles.fullExtrasInstancePrice}>
                      ${instance.price.toFixed(2)} × {instance.quantity} = ${(instance.price * instance.quantity).toFixed(2)}
                    </Text>
                    <TouchableOpacity onPress={() => removeExtraItemInstance(instance.instanceId)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.fullExtrasModalFooter}>
              <TouchableOpacity
                style={styles.fullExtrasClearBtn}
                onPress={() => {
                  setSelectedExtraItems({});
                  setExtraItemInstances([]);
                }}
              >
                <Text style={styles.fullExtrasClearBtnText}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.fullExtrasDoneBtn}
                onPress={() => setShowFullExtraItemsModal(false)}
              >
                <Text style={styles.fullExtrasDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Instance Modal */}
      <Modal visible={showAddInstanceModal} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.instanceModalOverlay}
          activeOpacity={1}
          onPress={() => { setShowAddInstanceModal(false); setEditingInstanceId(null); }}
        >
          <View style={styles.instanceModalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.instanceModalTitle}>
              {editingInstanceId ? 'Edit' : 'Add'} {selectedItemForInstance?.name}
            </Text>
            <Text style={styles.instanceModalSubtitle}>
              Default price: ${selectedItemForInstance?.price.toFixed(2)}
            </Text>
            <View style={styles.instanceModalPriceRow}>
              <Text style={styles.instancePriceLabel}>Price: $</Text>
              <TextInput
                style={styles.instancePriceInput}
                value={instancePrice}
                onChangeText={setInstancePrice}
                keyboardType="decimal-pad"
                placeholder={selectedItemForInstance?.price.toString()}
                placeholderTextColor="#94a3b8"
                autoFocus
              />
            </View>
            <View style={styles.instanceModalButtons}>
              <TouchableOpacity
                style={styles.instanceCancelBtn}
                onPress={() => { setShowAddInstanceModal(false); setEditingInstanceId(null); }}
              >
                <Text style={styles.instanceCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.instanceAddBtn}
                onPress={() => {
                  addExtraItemInstance();
                  setShowAddInstanceModal(false);
                }}
              >
                <Ionicons name={editingInstanceId ? "checkmark" : "add"} size={20} color="#fff" />
                <Text style={styles.instanceAddText}>{editingInstanceId ? 'Save' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Separation Type Modal */}
      <Modal visible={showSeparationModal} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.instanceModalOverlay}
          activeOpacity={1}
          onPress={() => setShowSeparationModal(false)}
        >
          <View style={styles.separationModalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.separationModalTitle}>Separation Type</Text>
            <Text style={styles.separationModalSubtitle}>
              How should this order be separated?
            </Text>

            <TouchableOpacity
              style={[styles.separationOption, separationType === 'wash_only' && styles.separationOptionActive]}
              onPress={() => {
                setSeparationType('wash_only');
                setShowSeparationModal(false);
              }}
            >
              <Ionicons name="water" size={24} color={separationType === 'wash_only' ? '#fff' : '#3b82f6'} />
              <View style={styles.separationOptionText}>
                <Text style={[styles.separationOptionTitle, separationType === 'wash_only' && styles.separationOptionTitleActive]}>
                  Separate Wash Only
                </Text>
                <Text style={[styles.separationOptionDesc, separationType === 'wash_only' && styles.separationOptionDescActive]}>
                  Wash separately, dry with other orders
                </Text>
              </View>
              {separationType === 'wash_only' && <Ionicons name="checkmark-circle" size={24} color="#fff" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.separationOption, separationType === 'all_the_way' && styles.separationOptionActive]}
              onPress={() => {
                setSeparationType('all_the_way');
                setShowSeparationModal(false);
              }}
            >
              <Ionicons name="git-branch" size={24} color={separationType === 'all_the_way' ? '#fff' : '#3b82f6'} />
              <View style={styles.separationOptionText}>
                <Text style={[styles.separationOptionTitle, separationType === 'all_the_way' && styles.separationOptionTitleActive]}>
                  Separate All The Way
                </Text>
                <Text style={[styles.separationOptionDesc, separationType === 'all_the_way' && styles.separationOptionDescActive]}>
                  Wash AND dry separately
                </Text>
              </View>
              {separationType === 'all_the_way' && <Ionicons name="checkmark-circle" size={24} color="#fff" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.separationClearBtn}
              onPress={() => {
                setSeparationType('none');
                setShowSeparationModal(false);
              }}
            >
              <Text style={styles.separationClearBtnText}>No Separation</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Active Orders Modal (Portrait Mode) */}
      <Modal visible={showActiveOrdersModal} animationType="slide" transparent>
        <View style={styles.activeOrdersModalOverlay}>
          <View style={styles.activeOrdersModalContent}>
            <View style={styles.activeOrdersModalHeader}>
              <Text style={styles.activeOrdersModalTitle}>Active Orders</Text>
              <TouchableOpacity onPress={() => setShowActiveOrdersModal(false)}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.activeOrdersModalScroll}>
              {/* New Orders */}
              <View style={styles.orderGroupModal}>
                <View style={[styles.orderGroupHeader, { backgroundColor: '#3b82f6' }]}>
                  <Text style={styles.orderGroupTitle}>New ({newOrders.length})</Text>
                </View>
                {newOrders.map(order => (
                  <TouchableOpacity
                    key={order._id}
                    style={[styles.orderItemModal, selectedOrder?._id === order._id && styles.orderItemSelected]}
                    onPress={() => setSelectedOrder(selectedOrder?._id === order._id ? null : order)}
                    onLongPress={() => { onOpenOrder(order._id); setShowActiveOrdersModal(false); }}
                  >
                    <Text style={styles.orderNumber}>#{order.orderId}</Text>
                    <Text style={styles.orderCustomer} numberOfLines={1}>{order.customerName}</Text>
                    <Text style={styles.orderPrice}>${(order.totalAmount || 0).toFixed(2)}</Text>
                    {!order.isPaid && <Ionicons name="alert-circle" size={16} color="#ef4444" />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Processing Orders */}
              <View style={styles.orderGroupModal}>
                <View style={[styles.orderGroupHeader, { backgroundColor: '#f59e0b' }]}>
                  <Text style={styles.orderGroupTitle}>Processing ({processingOrders.length})</Text>
                </View>
                {processingOrders.map(order => (
                  <TouchableOpacity
                    key={order._id}
                    style={[styles.orderItemModal, selectedOrder?._id === order._id && styles.orderItemSelected]}
                    onPress={() => setSelectedOrder(selectedOrder?._id === order._id ? null : order)}
                    onLongPress={() => { onOpenOrder(order._id); setShowActiveOrdersModal(false); }}
                  >
                    <Text style={styles.orderNumber}>#{order.orderId}</Text>
                    <Text style={styles.orderCustomer} numberOfLines={1}>{order.customerName}</Text>
                    <Text style={styles.orderPrice}>${(order.totalAmount || 0).toFixed(2)}</Text>
                    {!order.isPaid && <Ionicons name="alert-circle" size={16} color="#ef4444" />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Ready Orders */}
              <View style={styles.orderGroupModal}>
                <View style={[styles.orderGroupHeader, { backgroundColor: '#10b981' }]}>
                  <Text style={styles.orderGroupTitle}>Ready ({readyOrders.length})</Text>
                </View>
                {readyOrders.map(order => (
                  <TouchableOpacity
                    key={order._id}
                    style={[styles.orderItemModal, selectedOrder?._id === order._id && styles.orderItemSelected]}
                    onPress={() => setSelectedOrder(selectedOrder?._id === order._id ? null : order)}
                    onLongPress={() => { onOpenOrder(order._id); setShowActiveOrdersModal(false); }}
                  >
                    <Text style={styles.orderNumber}>#{order.orderId}</Text>
                    <Text style={styles.orderCustomer} numberOfLines={1}>{order.customerName}</Text>
                    <Text style={styles.orderPrice}>${(order.totalAmount || 0).toFixed(2)}</Text>
                    {!order.isPaid && <Ionicons name="alert-circle" size={16} color="#ef4444" />}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Payment Actions for Selected Order */}
            {selectedOrder && !selectedOrder.isPaid && (
              <View style={styles.paymentSectionModal}>
                <Text style={styles.paymentTitleModal}>Order #{selectedOrder.orderId} - ${(selectedOrder.totalAmount || 0).toFixed(2)}</Text>
                <View style={styles.paymentButtonsModal}>
                  {PAYMENT_METHODS.map(method => (
                    <TouchableOpacity
                      key={method.value}
                      style={[styles.paymentButtonModal, { backgroundColor: method.color }]}
                      onPress={() => { markOrderPaid(method.value); setShowActiveOrdersModal(false); }}
                    >
                      <Text style={styles.paymentButtonText}>{method.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Store Selector Modal */}
      <Modal visible={showStoreSelector} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.storeModalOverlay}
          activeOpacity={1}
          onPress={() => setShowStoreSelector(false)}
        >
          <View style={styles.storeModalContent}>
            <Text style={styles.storeModalTitle}>Select Store</Text>
            {availableLocations.map(location => (
              <TouchableOpacity
                key={location._id}
                style={[
                  styles.storeOption,
                  currentLocation?._id === location._id && styles.storeOptionActive,
                ]}
                onPress={async () => {
                  await onSelectLocation(location);
                  setShowStoreSelector(false);
                  // Clear customer selection when switching stores
                  setSelectedCustomer(null);
                  setCustomerSearch('');
                  // Reload customers and orders for new store
                  loadCustomers();
                  onOrderCreated();
                }}
              >
                <Ionicons
                  name="storefront"
                  size={20}
                  color={currentLocation?._id === location._id ? '#fff' : '#64748b'}
                />
                <Text
                  style={[
                    styles.storeOptionText,
                    currentLocation?._id === location._id && styles.storeOptionTextActive,
                  ]}
                >
                  {location.name}
                </Text>
                {currentLocation?._id === location._id && (
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2563eb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerCompact: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerTitleCompact: {
    fontSize: 14,
  },
  headerStoreName: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    flex: 1,
    textAlign: 'center',
  },
  headerStoreNameCompact: {
    fontSize: 11,
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    maxWidth: 150,
    flexShrink: 1,
  },
  storeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    flexShrink: 1,
  },
  storeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  storeLabelText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  exitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  exitButtonCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  contentPortrait: {
    flexDirection: 'column',
  },
  leftPanel: {
    flex: 1,
    backgroundColor: '#fff',
  },
  leftPanelPortrait: {
    flex: 1,
  },
  leftPanelPortraitContent: {
    paddingBottom: 40,
  },
  leftPanelContent: {
    padding: 12,
    paddingBottom: 40,
  },
  rightPanel: {
    width: 280,
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  rightPanelPortrait: {
    width: '100%',
    height: 250,
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  customerSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  storeFilterLabel: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
  },
  searchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  searchResults: {
    maxHeight: 120,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  customerResult: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  customerPhone: {
    fontSize: 13,
    color: '#64748b',
  },
  selectedCustomer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#dbeafe',
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  selectedCustomerInfo: {
    flex: 1,
    marginRight: 12,
  },
  selectedCustomerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  selectedCustomerPhone: {
    fontSize: 14,
    color: '#2563eb',
  },
  customerCredit: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10b981',
    marginTop: 2,
  },
  customerAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  customerAddressInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    padding: 0,
  },
  customerDeliveryFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  deliveryFeeInlineLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  deliveryFeeInlineInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    padding: 0,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  weightDisplayInline: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 10,
  },
  weightDisplay: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  weightLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  weightValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  addBagButtonInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 6,
    minHeight: 60,
  },
  addBagButtonTextInline: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
    justifyContent: 'center',
  },
  numpadKey: {
    width: 70,
    height: 60,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numpadKeyClear: {
    backgroundColor: '#fee2e2',
  },
  numpadKeyText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1e293b',
  },
  numpadKeyTextClear: {
    color: '#ef4444',
  },
  colorSection: {
    marginBottom: 12,
  },
  colorLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 6,
  },
  colorTextInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1e293b',
    marginBottom: 8,
  },
  colorButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  colorButtonsInline: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  colorButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorButtonSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorButtonSelected: {
    borderWidth: 3,
    transform: [{ scale: 1.1 }],
  },
  bagOptionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  colorTextInputSmall: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
  },
  bagDescInputSmall: {
    flex: 2,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
  },
  addBagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 18,
    borderRadius: 12,
    gap: 8,
    minHeight: 60,
  },
  addBagButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bagsList: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
  },
  bagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 10,
  },
  bagColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  bagText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
  },
  totalWeight: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 8,
    textAlign: 'right',
  },
  sameDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef3c7',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  sameDayButtonActive: {
    backgroundColor: '#f59e0b',
  },
  sameDayText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f59e0b',
  },
  sameDayTextActive: {
    color: '#fff',
  },
  extrasSection: {
    marginTop: 8,
  },
  extraSearchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1e293b',
    marginBottom: 8,
  },
  extraSearchResults: {
    maxHeight: 150,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  extraSearchResultRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  extraSearchResult: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  extraSearchAddCustom: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#ddd6fe',
  },
  extraSearchResultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  extraSearchResultPrice: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  // Instance styles
  instancesList: {
    marginTop: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 10,
  },
  instanceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  instanceInfo: {
    flex: 1,
  },
  instanceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  instancePrice: {
    fontSize: 12,
    color: '#b45309',
  },
  instanceControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instanceQtyBtn: {
    width: 28,
    height: 28,
    backgroundColor: '#fff',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instanceQty: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    minWidth: 20,
    textAlign: 'center',
  },
  instanceDeleteBtn: {
    marginLeft: 8,
    padding: 4,
  },
  // Instance Modal
  // View All button styles
  extrasSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  viewAllExtrasBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllExtrasBtnText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  quickExtrasButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  quickExtrasButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    flex: 1,
  },
  // Full Extra Items Modal styles
  fullExtrasModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullExtrasModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  fullExtrasModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  fullExtrasModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  fullExtrasModalScroll: {
    maxHeight: 400,
    padding: 16,
  },
  fullExtrasModalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  fullExtrasModalItemSelected: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  fullExtrasModalItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  fullExtrasModalItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  fullExtrasModalItemPrice: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  fullExtrasAddMultipleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  fullExtrasAddMultipleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  fullExtrasQuantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fullExtrasQtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullExtrasQtyBtnDisabled: {
    backgroundColor: '#f1f5f9',
  },
  fullExtrasQtyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    minWidth: 24,
    textAlign: 'center',
  },
  fullExtrasInstancesSection: {
    backgroundColor: '#fef3c7',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  fullExtrasInstancesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 8,
  },
  fullExtrasInstanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  fullExtrasInstanceName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    flex: 1,
  },
  fullExtrasInstancePrice: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 12,
  },
  fullExtrasModalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  fullExtrasClearBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  fullExtrasClearBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  fullExtrasDoneBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  fullExtrasDoneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  instanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instanceModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: 300,
  },
  instanceModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 4,
  },
  instanceModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  // Separation Modal Styles
  separationModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: 320,
  },
  separationModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 4,
  },
  separationModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  separationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  separationOptionActive: {
    backgroundColor: '#3b82f6',
  },
  separationOptionText: {
    flex: 1,
  },
  separationOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  separationOptionTitleActive: {
    color: '#fff',
  },
  separationOptionDesc: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  separationOptionDescActive: {
    color: '#dbeafe',
  },
  separationClearBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  separationClearBtnText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  instancePriceRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  instanceModalPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  instancePriceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  instancePriceInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginLeft: 8,
  },
  instanceModalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  instanceCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  instanceCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  instanceAddBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    gap: 6,
  },
  instanceAddText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  selectedExtras: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  selectedExtraChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  selectedExtraText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  extrasGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  extraItemContainer: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  extraItemContainerFull: {
    // No change needed, just use full width of container
  },
  extraItem: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    alignItems: 'center',
  },
  extraItemFull: {
    borderRadius: 8,
  },
  extraItemAddCustom: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#ddd6fe',
  },
  extraItemActive: {
    backgroundColor: '#2563eb',
  },
  extraItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  extraItemTextActive: {
    color: '#fff',
  },
  extraItemPrice: {
    fontSize: 11,
    color: '#64748b',
  },
  instructionsInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  totalSection: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  subtotalAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
  },
  creditAppliedLabel: {
    fontSize: 14,
    color: '#10b981',
  },
  creditAppliedAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  clearButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  clearButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  ordersScroll: {
    flex: 1,
  },
  ordersScrollPortrait: {
    flex: 1,
  },
  orderGroup: {
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
  },
  orderGroupPortrait: {
    width: 150,
    marginRight: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
  },
  orderGroupScrollPortrait: {
    maxHeight: 130,
  },
  orderGroupHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  orderGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  orderItemPortrait: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  orderItemSelected: {
    backgroundColor: '#dbeafe',
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    width: 50,
  },
  orderCustomer: {
    flex: 1,
    fontSize: 13,
    color: '#64748b',
  },
  orderCustomerPortrait: {
    fontSize: 12,
    color: '#64748b',
  },
  orderPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  orderPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentSection: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  paymentSectionPortrait: {
    width: 120,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    justifyContent: 'center',
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 10,
  },
  paymentTitlePortrait: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  paymentAmountPortrait: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
    textAlign: 'center',
    marginBottom: 8,
  },
  paymentButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentButtonsPortrait: {
    gap: 6,
  },
  paymentButton: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  paymentButtonPortrait: {
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  paymentButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentButtonTextPortrait: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Quick Add Customer
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  quickAddButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Order Type
  orderTypeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  orderTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  orderTypeButtonActive: {
    backgroundColor: '#2563eb',
  },
  orderTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  orderTypeTextActive: {
    color: '#fff',
  },
  // Delivery Options
  deliveryOptions: {
    marginTop: 12,
  },
  deliveryInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    marginBottom: 10,
  },
  deliveryFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deliveryFeeLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  deliveryFeeInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1e293b',
  },
  // Bag Description
  bagDescInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1e293b',
    marginTop: 8,
  },
  bagInfo: {
    flex: 1,
  },
  bagDesc: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  // Toggles Row
  togglesRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef3c7',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#f59e0b',
  },
  toggleButtonActiveBlue: {
    backgroundColor: '#3b82f6',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  toggleTextActive: {
    color: '#fff',
  },
  // Mini Calendar
  weekCalendar: {
    marginBottom: 12,
  },
  calendarDay: {
    width: 60,
    height: 70,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  calendarDaySelected: {
    backgroundColor: '#2563eb',
  },
  calendarDayToday: {
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  calendarDayName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  calendarDayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  calendarMonth: {
    fontSize: 10,
    color: '#94a3b8',
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  timeSlots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlotButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  timeSlotActive: {
    backgroundColor: '#2563eb',
  },
  timeSlotText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  timeSlotTextActive: {
    color: '#fff',
  },
  exactTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  exactTimeButtonActive: {
    backgroundColor: '#2563eb',
  },
  exactTimeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  exactTimeTextActive: {
    color: '#fff',
  },
  // Time Picker Modal
  timePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timePickerContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: 300,
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  timePickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  timePickerDoneButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  timePickerDoneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Payment Options
  paymentToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  paymentMethodButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  // Credit
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    padding: 12,
    borderRadius: 10,
  },
  creditInfo: {
    flex: 1,
  },
  creditLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  creditAmount: {
    fontSize: 12,
    color: '#64748b',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 12,
  },
  modalButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Store Selector Modal
  storeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  storeModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 350,
  },
  storeModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    textAlign: 'center',
  },
  storeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    marginBottom: 10,
    gap: 12,
  },
  storeOptionActive: {
    backgroundColor: '#2563eb',
  },
  storeOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  storeOptionTextActive: {
    color: '#fff',
  },
  // Active Orders Button (portrait header)
  activeOrdersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  activeOrdersButtonCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  activeOrdersButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  activeOrdersButtonTextCompact: {
    fontSize: 11,
  },
  activeOrdersBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  activeOrdersBadgeCompact: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
  },
  activeOrdersBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  activeOrdersBadgeTextCompact: {
    fontSize: 10,
  },
  // Active Orders Modal
  activeOrdersModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  activeOrdersModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  activeOrdersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  activeOrdersModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  activeOrdersModalScroll: {
    maxHeight: 400,
    paddingHorizontal: 16,
  },
  orderGroupModal: {
    marginBottom: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    overflow: 'hidden',
  },
  orderItemModal: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 10,
  },
  paymentSectionModal: {
    backgroundColor: '#f8fafc',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  paymentTitleModal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  paymentButtonsModal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  paymentButtonModal: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    minWidth: '45%',
    alignItems: 'center',
  },
  // Portrait left panel full screen
  leftPanelContentPortrait: {
    paddingBottom: 80,
  },
  // ========== COMPACT TABLET STYLES ==========
  topRowLandscape: {
    flexDirection: 'row',
    gap: 12,
  },
  middleRowLandscape: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  bottomRowLandscape: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  sectionCompact: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  sectionHalf: {
    flex: 1,
  },
  sectionTitleSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
  },
  storeFilterLabelSmall: {
    fontSize: 11,
    color: '#2563eb',
  },
  searchInputCompact: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchResultsCompact: {
    maxHeight: 100,
    marginTop: 4,
  },
  customerResultCompact: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customerNameCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  customerPhoneCompact: {
    fontSize: 11,
    color: '#64748b',
  },
  quickAddButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    gap: 4,
  },
  quickAddButtonTextCompact: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  selectedCustomerCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#dbeafe',
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  selectedCustomerInfoCompact: {
    flex: 1,
    marginRight: 8,
  },
  selectedCustomerNameCompact: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  selectedCustomerPhoneCompact: {
    fontSize: 12,
    color: '#2563eb',
  },
  customerCreditCompact: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
  },
  customerAddressRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 4,
  },
  customerAddressInputCompact: {
    flex: 1,
    fontSize: 12,
    color: '#1e293b',
    padding: 0,
  },
  customerDeliveryFeeRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  deliveryFeeInlineLabelCompact: {
    fontSize: 11,
    color: '#64748b',
  },
  deliveryFeeInlineInputCompact: {
    backgroundColor: '#fff',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    color: '#1e293b',
    width: 50,
  },
  orderTypeRowCompact: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  orderTypeButtonCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    gap: 4,
  },
  orderTypeTextCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  optionsRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fef3c7',
    gap: 4,
  },
  optionButtonActiveYellow: {
    backgroundColor: '#f59e0b',
  },
  optionButtonActiveBlue: {
    backgroundColor: '#3b82f6',
  },
  optionTextCompact: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  optionTextActiveCompact: {
    color: '#fff',
  },
  extrasButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#dbeafe',
    gap: 4,
  },
  extrasButtonTextCompact: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  weightRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weightDisplayCompact: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 8,
    minWidth: 70,
  },
  weightLabelCompact: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  weightValueCompact: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  numpadCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  numpadKeyCompact: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  numpadKeyClearCompact: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
  },
  numpadKeyTextCompact: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  bagSectionCompact: {
    gap: 6,
  },
  colorButtonsCompact: {
    flexDirection: 'row',
    gap: 6,
  },
  colorButtonCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorButtonSelectedCompact: {
    borderWidth: 3,
    borderColor: '#2563eb',
  },
  customColorInputCompact: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#fcd34d',
    width: 80,
    marginRight: 8,
  },
  bagDescInputCompact: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flex: 1,
  },
  addBagButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addBagButtonTextCompact: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  bagsListCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    alignItems: 'center',
  },
  bagItemCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  bagColorDotCompact: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bagTextCompact: {
    fontSize: 11,
    color: '#1e293b',
    fontWeight: '500',
  },
  totalWeightCompact: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  weekCalendarCompact: {
    marginBottom: 6,
  },
  timeSlotsCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  timeSlotButtonCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  timeSlotActiveCompact: {
    backgroundColor: '#2563eb',
  },
  exactTimeButtonActiveCompact: {
    backgroundColor: '#2563eb',
  },
  timeSlotTextCompact: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  timeSlotTextActiveCompact: {
    color: '#fff',
  },
  notesInputCompact: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentSectionCompact: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
  },
  paymentToggleRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  paymentLabelCompact: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  paymentMethodsRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  paymentMethodButtonCompact: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  paymentMethodTextCompact: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  creditRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  creditLabelCompact: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  totalSectionCompact: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
  },
  totalRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  totalLabelCompact: {
    fontSize: 12,
    color: '#64748b',
  },
  subtotalAmountCompact: {
    fontSize: 12,
    color: '#1e293b',
  },
  creditAppliedLabelCompact: {
    fontSize: 12,
    color: '#10b981',
  },
  creditAppliedAmountCompact: {
    fontSize: 12,
    color: '#10b981',
  },
  grandTotalLabelCompact: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  totalAmountCompact: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb',
  },
  actionsSectionCompact: {
    flex: 1,
    gap: 6,
  },
  createButtonCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  createButtonTextCompact: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  clearButtonCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearButtonTextCompact: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  // Tablet 3-Column Layout Styles
  tabletLayout: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  tabletColumnLeft: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  tabletColumnMiddle: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  tabletColumnRight: {
    width: 220,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  tabletColumnContent: {
    gap: 12,
    paddingBottom: 20,
  },
  tabletColumnContentCenter: {
    gap: 12,
    paddingBottom: 20,
  },
  tabletSection: {
    marginBottom: 8,
  },
  tabletSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  tabletInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  tabletSearchResults: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxHeight: 150,
  },
  tabletCustomerResult: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tabletCustomerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  tabletCustomerPhone: {
    fontSize: 13,
    color: '#64748b',
  },
  tabletSelectedCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    padding: 12,
    borderRadius: 10,
    marginTop: 6,
  },
  tabletSelectedName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  tabletSelectedPhone: {
    fontSize: 14,
    color: '#2563eb',
  },
  tabletCredit: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10b981',
    marginTop: 2,
  },
  tabletOrderTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tabletOrderTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 6,
  },
  tabletOrderTypeBtnActive: {
    backgroundColor: '#2563eb',
  },
  tabletOrderTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  tabletOrderTypeTextActive: {
    color: '#fff',
  },
  tabletDeliveryInfo: {
    marginTop: 8,
    gap: 8,
  },
  tabletDeliveryFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabletLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  tabletFeeInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#1e293b',
  },
  tabletOptionsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tabletOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  tabletOptionBtnYellow: {
    backgroundColor: '#f59e0b',
  },
  tabletOptionBtnBlue: {
    backgroundColor: '#3b82f6',
  },
  tabletOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabletOptionTextActive: {
    color: '#fff',
  },
  tabletExtrasBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  tabletExtrasBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  tabletNotesInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1e293b',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  tabletWeightDisplay: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#f1f5f9',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    marginBottom: 12,
  },
  tabletWeightLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  tabletWeightValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  tabletNumpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    maxWidth: 260,
    alignSelf: 'center',
  },
  tabletNumpadKey: {
    width: 70,
    height: 56,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletNumpadKeyClear: {
    backgroundColor: '#fee2e2',
  },
  tabletNumpadKeyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1e293b',
  },
  tabletNumpadKeyTextClear: {
    color: '#ef4444',
  },
  tabletBagSection: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
  },
  tabletColorRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  tabletColorBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabletColorBtnSelected: {
    borderWidth: 3,
    transform: [{ scale: 1.1 }],
  },
  tabletAddBagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 6,
    width: '100%',
    maxWidth: 220,
  },
  tabletAddBagText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tabletBagsList: {
    width: '100%',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  tabletBagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabletBagDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  tabletBagText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  tabletTotalWeight: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
    marginLeft: 'auto',
  },
  tabletDateBtn: {
    width: 54,
    height: 64,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabletDateBtnSelected: {
    backgroundColor: '#2563eb',
  },
  tabletDateDay: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  tabletDateNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  tabletDateTextSelected: {
    color: '#fff',
  },
  tabletTimeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  tabletTimeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    alignItems: 'center',
  },
  tabletTimeBtnSelected: {
    backgroundColor: '#2563eb',
  },
  tabletTimeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabletTimeTextSelected: {
    color: '#fff',
  },
  tabletExactTimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  tabletExactTimeBtnActive: {
    backgroundColor: '#2563eb',
  },
  tabletExactTimeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  tabletExactTimeTextActive: {
    color: '#fff',
  },
  tabletPaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabletPaymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tabletPaymentBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  tabletPaymentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabletCreditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#ecfdf5',
    padding: 10,
    borderRadius: 8,
  },
  tabletCreditLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10b981',
  },
  tabletTotalSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
  },
  tabletTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tabletTotalLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  tabletSubtotal: {
    fontSize: 13,
    color: '#1e293b',
  },
  tabletCreditApplied: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '500',
  },
  tabletGrandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  tabletGrandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  tabletGrandTotal: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2563eb',
  },
  tabletCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    marginTop: 'auto',
  },
  tabletCreateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  tabletClearBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  tabletClearText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  // Enhanced Bags List Styles
  tabletBagsListEnhanced: {
    width: '100%',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  tabletBagItemEnhanced: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabletBagDotLarge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
  tabletBagInfo: {
    flex: 1,
  },
  tabletBagWeight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  tabletBagColor: {
    fontSize: 13,
    color: '#64748b',
    textTransform: 'capitalize',
  },
  tabletBagDesc: {
    fontSize: 12,
    color: '#2563eb',
    fontStyle: 'italic',
    marginTop: 2,
  },
  tabletBagRemove: {
    padding: 8,
  },
  tabletBagsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  tabletBagsTotalLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  tabletBagsTotalWeight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  // Custom color input
  tabletCustomColorInput: {
    width: '100%',
    maxWidth: 220,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  // Bag description input
  tabletBagDescInput: {
    width: '100%',
    maxWidth: 220,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1e293b',
    textAlign: 'center',
  },
  // Smaller Date Buttons for dual date sections
  tabletDateBtnSmall: {
    width: 48,
    height: 52,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabletDateDaySmall: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  tabletDateNumSmall: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  // Pay date picker styles
  paidAtDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paidAtDateText: {
    fontSize: 14,
    color: '#1e293b',
    flex: 1,
  },
  paidAtDateBtnCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paidAtDateTextCompact: {
    fontSize: 12,
    color: '#1e293b',
  },
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '90%',
    maxWidth: 350,
    paddingBottom: 20,
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  datePickerCancel: {
    fontSize: 16,
    color: '#ef4444',
  },
  datePickerDone: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  datePickerSpinner: {
    height: 200,
  },
  // Delivery type selector styles
  deliveryTypeSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  deliveryTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  deliveryTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  deliveryTypeBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  deliveryTypeBtnActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  deliveryTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 4,
  },
  deliveryTypeTextActive: {
    color: '#fff',
  },
  deliveryTypePrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  deliveryTypePriceActive: {
    color: '#fff',
  },
});
