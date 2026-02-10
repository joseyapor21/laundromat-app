import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { localPrinter } from '../services/LocalPrinter';
import { generateCustomerReceiptText, generateStoreCopyText, generateBagLabelText } from '../services/receiptGenerator';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import type { Order, ExtraItem, Settings, Bag, OrderType, OrderExtraItem } from '../types';
import { calculateWeightBasedPrice, calculateWeightBasedQuantity, roundToNearestQuarter } from '../utils/pricing';
import { formatPhoneNumber, formatPhoneInput } from '../utils/phoneFormat';

export default function EditOrderScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentLocation } = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('storePickup');
  const [isSameDay, setIsSameDay] = useState(false);

  // Bags
  const [bags, setBags] = useState<Bag[]>([]);

  // Extra items
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [selectedExtraItems, setSelectedExtraItems] = useState<Record<string, { quantity: number; price: number; overrideTotal?: number }>>({});
  const [showExtraItemsModal, setShowExtraItemsModal] = useState(false);

  // Pricing
  const [settings, setSettings] = useState<Settings | null>(null);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [priceChangeNote, setPriceChangeNote] = useState('');
  const [showPriceOverride, setShowPriceOverride] = useState(false);

  // Delivery
  const [deliveryPrice, setDeliveryPrice] = useState(0);
  const [deliveryType, setDeliveryType] = useState<'full' | 'pickupOnly' | 'deliveryOnly'>('full');

  // Customer credit
  const [applyCredit, setApplyCredit] = useState(false);
  const [creditToApply, setCreditToApply] = useState(0);

  // Date/Time
  const [estimatedPickupDate, setEstimatedPickupDate] = useState<Date | null>(null);
  const [dropOffDate, setDropOffDate] = useState<Date | null>(null);
  const [deliverySchedule, setDeliverySchedule] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<'pickup' | 'dropoff' | 'delivery' | null>(null);
  const [showTimePicker, setShowTimePicker] = useState<'pickup' | 'dropoff' | 'delivery' | null>(null);

  const loadOrder = useCallback(async () => {
    try {
      const [orderData, settingsData, extraItemsData] = await Promise.all([
        api.getOrder(route.params.orderId),
        api.getSettings(),
        api.getExtraItems(),
      ]);

      setOrder(orderData);
      setSettings(settingsData);
      setExtraItems(extraItemsData.filter((item: ExtraItem) => item.isActive));

      // Populate form with order data
      setCustomerName(orderData.customerName || '');
      setCustomerPhone(formatPhoneNumber(orderData.customerPhone) || '');
      setCustomerAddress(orderData.customer?.address || '');

      // Include customer notes in special instructions if not already present
      let instructions = orderData.specialInstructions || '';
      const customerNotes = orderData.customer?.notes || '';
      if (customerNotes && !instructions.includes(customerNotes)) {
        instructions = customerNotes + (instructions ? '\n' + instructions : '');
      }
      setSpecialInstructions(instructions);

      setOrderType(orderData.orderType || 'storePickup');
      setIsSameDay(orderData.isSameDay || false);
      setBags(orderData.bags || []);

      // Delivery price from order first, then customer
      if (orderData.deliveryFee && orderData.deliveryFee > 0) {
        setDeliveryPrice(orderData.deliveryFee);
      } else if (orderData.customer?.deliveryFee) {
        const fee = parseFloat(orderData.customer.deliveryFee.replace('$', '')) || 0;
        setDeliveryPrice(fee);
      }

      // Delivery type
      if (orderData.deliveryType) {
        setDeliveryType(orderData.deliveryType);
      }

      // Date/Time fields
      if (orderData.estimatedPickupDate) {
        setEstimatedPickupDate(new Date(orderData.estimatedPickupDate));
      }
      if (orderData.dropOffDate) {
        setDropOffDate(new Date(orderData.dropOffDate));
      }
      if (orderData.deliverySchedule) {
        setDeliverySchedule(new Date(orderData.deliverySchedule));
      }

      // Populate extra items
      if (orderData.extraItems) {
        const extraItemsMap: Record<string, { quantity: number; price: number; overrideTotal?: number }> = {};
        orderData.extraItems.forEach((item: any) => {
          const itemId = item.item?._id || item.itemId;
          if (itemId) {
            extraItemsMap[itemId] = {
              quantity: item.quantity,
              price: item.price || item.item?.price || 0,
              overrideTotal: item.overrideTotal
            };
          }
        });
        setSelectedExtraItems(extraItemsMap);
      }

      // Price override - check if exists (not just truthy, since 0 could be a valid override)
      if (orderData.priceOverride !== undefined && orderData.priceOverride !== null) {
        setPriceOverride(orderData.priceOverride);
        setShowPriceOverride(true);
        setPriceChangeNote(orderData.priceChangeNote || '');
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
  }, [loadOrder]);

  // Calculate total weight from bags
  const calculateTotalWeight = useCallback(() => {
    return bags.reduce((total, bag) => total + (bag.weight || 0), 0);
  }, [bags]);

  // Update weight-based extra items when weight changes
  useEffect(() => {
    const totalWeight = calculateTotalWeight();
    setSelectedExtraItems(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      Object.keys(updated).forEach(itemId => {
        const item = extraItems.find(e => e._id === itemId);
        if (item?.perWeightUnit && item.perWeightUnit > 0) {
          const newQty = calculateWeightBasedQuantity(totalWeight, item.perWeightUnit);
          if (updated[itemId].quantity !== newQty && updated[itemId].quantity > 0) {
            updated[itemId] = { ...updated[itemId], quantity: newQty };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [bags, extraItems, calculateTotalWeight]);

  // Calculate same day price per pound (regular + extra)
  const getSameDayPricePerPound = (): number => {
    if (!settings) return 0;
    const regularPrice = settings.pricePerPound || 1.25;
    const extraCentsPerPound = settings.sameDayExtraCentsPerPound || 0.33;
    return regularPrice + extraCentsPerPound;
  };

  // Calculate same day extra charge
  const getSameDayExtraCharge = (): number => {
    const weight = calculateTotalWeight();
    if (!settings || !isSameDay || weight <= 0) return 0;

    const extraCentsPerPound = settings.sameDayExtraCentsPerPound || 0.33;
    const calculatedExtra = weight * extraCentsPerPound;
    const minimumCharge = settings.sameDayMinimumCharge || 5;
    return Math.max(calculatedExtra, minimumCharge);
  };

  // Calculate total price using tiered pricing
  const calculateTotalPrice = (): number => {
    if (!settings) return order?.totalAmount || 0;

    const weight = calculateTotalWeight();
    let basePrice = 0;

    if (weight > 0) {
      // Pricing: minimum price for first X pounds, then price per pound for extra
      if (weight <= settings.minimumWeight) {
        // Under or at minimum weight - charge minimum price
        basePrice = settings.minimumPrice;
      } else {
        // Over minimum weight - charge minimum + extra pounds at price per pound
        const extraPounds = weight - settings.minimumWeight;
        basePrice = settings.minimumPrice + (extraPounds * settings.pricePerPound);
      }
    }

    const sameDayExtra = getSameDayExtraCharge();

    const extraItemsTotal = Object.entries(selectedExtraItems).reduce((total, [itemId, data]) => {
      // Use override total if set (for any item type)
      if (data.overrideTotal !== undefined && data.overrideTotal !== null) {
        return total + data.overrideTotal;
      }
      const item = extraItems.find(e => e._id === itemId);
      const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
      if (isWeightBased) {
        // calculateWeightBasedPrice applies minimum and rounds to nearest quarter
        const itemTotal = calculateWeightBasedPrice(weight, item.perWeightUnit!, data.price);
        return total + itemTotal;
      }
      return total + (data.price * data.quantity);
    }, 0);

    let deliveryFee = 0;
    if (orderType === 'delivery' && deliveryPrice > 0) {
      deliveryFee = deliveryPrice;
      // Apply half price for one-way delivery
      if (deliveryType === 'pickupOnly' || deliveryType === 'deliveryOnly') {
        deliveryFee = deliveryFee / 2;
      }
    }

    return basePrice + sameDayExtra + extraItemsTotal + deliveryFee;
  };

  const getFinalPrice = () => {
    return priceOverride !== null ? priceOverride : calculateTotalPrice();
  };

  // Bag management
  const addBag = () => {
    const newBag: Bag = {
      identifier: `Bag ${bags.length + 1}`,
      weight: 0,
      color: '',
      description: ''
    };
    setBags([...bags, newBag]);
  };

  const removeBag = (index: number) => {
    setBags(bags.filter((_, i) => i !== index));
  };

  const updateBag = (index: number, field: keyof Bag, value: string | number) => {
    const updatedBags = bags.map((bag, i) =>
      i === index ? { ...bag, [field]: value } : bag
    );
    setBags(updatedBags);
  };

  const removeExtraItem = (itemId: string) => {
    const newExtras = { ...selectedExtraItems };
    delete newExtras[itemId];
    setSelectedExtraItems(newExtras);
  };

  const updateExtraItem = (itemId: string, field: 'quantity' | 'price' | 'overrideTotal', value: number | undefined) => {
    setSelectedExtraItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  // Save order
  const handleSave = async () => {
    if (showPriceOverride && !priceChangeNote.trim()) {
      Alert.alert('Error', 'Please provide a reason for the price change');
      return;
    }

    setSaving(true);
    try {
      const totalWeight = calculateTotalWeight();
      const orderExtraItems = Object.entries(selectedExtraItems)
        .filter(([, data]) => data.quantity > 0)
        .map(([itemId, data]) => {
          const item = extraItems.find(i => i._id === itemId);
          const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
          const qty = isWeightBased ? calculateWeightBasedQuantity(totalWeight, item.perWeightUnit!) : data.quantity;
          return {
            itemId,
            name: item?.name || '',
            quantity: qty,
            price: data.price,
            overrideTotal: data.overrideTotal
          };
        });

      // Calculate laundry subtotal (weight-based pricing only)
      let laundrySubtotal = 0;
      if (settings && totalWeight > 0) {
        if (totalWeight <= settings.minimumWeight) {
          laundrySubtotal = settings.minimumPrice;
        } else {
          const extraPounds = totalWeight - settings.minimumWeight;
          laundrySubtotal = settings.minimumPrice + (extraPounds * settings.pricePerPound);
        }
      }

      const finalPrice = getFinalPrice();
      const creditCoversOrder = applyCredit && creditToApply >= finalPrice;

      const updates: any = {
        customerName,
        customerPhone,
        weight: calculateTotalWeight(),
        specialInstructions,
        totalAmount: finalPrice,
        subtotal: laundrySubtotal,
        sameDayFee: isSameDay ? getSameDayExtraCharge() : 0,
        priceOverride: showPriceOverride ? priceOverride : null,
        priceChangeNote: showPriceOverride ? priceChangeNote : null,
        extraItems: orderExtraItems,
        bags,
        orderType,
        isSameDay,
        sameDayPricePerPound: isSameDay ? getSameDayPricePerPound() : undefined,
        // Delivery fields
        deliveryType: orderType === 'delivery' ? deliveryType : null,
        deliveryFee: orderType === 'delivery' ? (deliveryType === 'pickupOnly' || deliveryType === 'deliveryOnly' ? deliveryPrice / 2 : deliveryPrice) : 0,
        // Date/Time fields
        estimatedPickupDate: estimatedPickupDate || undefined,
        dropOffDate: dropOffDate || undefined,
        deliverySchedule: orderType === 'delivery' ? deliverySchedule || undefined : undefined,
        // Credit fields
        creditApplied: applyCredit ? creditToApply : (order?.creditApplied || 0),
        // Mark as paid if credit covers full amount
        ...(creditCoversOrder && {
          isPaid: true,
          paymentMethod: 'credit',
        }),
      };

      // Update customer address if delivery order
      if (orderType === 'delivery' && order?.customer && customerAddress !== order.customer.address) {
        try {
          await api.updateCustomer(order.customer._id, {
            address: customerAddress,
            deliveryFee: `$${deliveryPrice.toFixed(2)}`,
          });
        } catch (error) {
          console.error('Failed to update customer address:', error);
        }
      }

      await api.updateOrder(order!._id, updates);

      // Auto-print if bags were added to delivery order
      const originalBagCount = order?.bags?.length || 0;
      const newBagCount = bags.length;
      const bagsWereAdded = newBagCount > originalBagCount;

      if (bagsWereAdded && settings?.thermalPrinterIp) {
        try {
          const printerIp = settings.thermalPrinterIp;
          const printerPort = settings.thermalPrinterPort || 9100;

          // Fetch updated order for printing
          const updatedOrder = await api.getOrder(order!._id);

          // Print customer receipt
          const customerReceipt = generateCustomerReceiptText(updatedOrder, currentLocation);
          await localPrinter.printReceipt(printerIp, customerReceipt, printerPort);

          // Print store copy
          const storeCopy = generateStoreCopyText(updatedOrder, currentLocation);
          await localPrinter.printReceipt(printerIp, storeCopy, printerPort);

          // Print bag labels
          if (updatedOrder.bags && updatedOrder.bags.length > 0) {
            for (let i = 0; i < updatedOrder.bags.length; i++) {
              const bag = updatedOrder.bags[i];
              const bagLabel = generateBagLabelText(updatedOrder, bag, i + 1, updatedOrder.bags.length);
              await localPrinter.printReceipt(printerIp, bagLabel, printerPort);
            }
          }
        } catch (printError) {
          console.error('Auto-print failed:', printError);
          // Don't show error - order was still updated successfully
        }
      }

      // Apply customer credit if selected
      if (applyCredit && creditToApply > 0 && order?.customer) {
        try {
          await api.useCustomerCredit(
            order.customer._id,
            creditToApply,
            `Applied to Order #${order.orderId}`
          );
        } catch (creditError) {
          console.error('Failed to apply credit:', creditError);
          // Order was still updated, just credit wasn't applied
        }
      }

      Alert.alert('Success', 'Order updated successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Failed to update order:', error);
      Alert.alert('Error', 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  // Delete order (admin only)
  const handleDelete = () => {
    Alert.alert(
      'Delete Order',
      'Are you sure you want to delete this order? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await api.deleteOrder(order!._id);
              Alert.alert('Success', 'Order deleted successfully', [
                { text: 'OK', onPress: () => navigation.navigate('Main') }
              ]);
            } catch (error) {
              console.error('Failed to delete order:', error);
              Alert.alert('Error', 'Failed to delete order');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!order) return null;

  const weight = calculateTotalWeight();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScrollView
        bottomOffset={50}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Edit Order #{order.orderId}</Text>
          </View>

          {/* Customer Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Information</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Customer Name</Text>
                <TextInput
                  style={styles.input}
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Customer name"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={customerPhone}
                  onChangeText={(text) => setCustomerPhone(formatPhoneInput(text))}
                  placeholder="(555) 555-5555"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </View>
              {orderType === 'delivery' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Address</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={customerAddress}
                    onChangeText={setCustomerAddress}
                    placeholder="Delivery address"
                    placeholderTextColor="#94a3b8"
                    multiline
                    numberOfLines={2}
                  />
                </View>
              )}
            </View>
          </View>

          {/* Order Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Type</Text>
            <View style={styles.orderTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.orderTypeButton,
                  orderType === 'storePickup' && styles.orderTypeButtonActive
                ]}
                onPress={() => setOrderType('storePickup')}
              >
                <Ionicons
                  name="storefront"
                  size={20}
                  color={orderType === 'storePickup' ? '#fff' : '#64748b'}
                />
                <Text style={[
                  styles.orderTypeText,
                  orderType === 'storePickup' && styles.orderTypeTextActive
                ]}>
                  In-Store
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.orderTypeButton,
                  orderType === 'delivery' && styles.orderTypeButtonActive
                ]}
                onPress={() => setOrderType('delivery')}
              >
                <Ionicons
                  name="car"
                  size={20}
                  color={orderType === 'delivery' ? '#fff' : '#64748b'}
                />
                <Text style={[
                  styles.orderTypeText,
                  orderType === 'delivery' && styles.orderTypeTextActive
                ]}>
                  Delivery
                </Text>
              </TouchableOpacity>
            </View>

            {/* Delivery Type Selection - Only shown for delivery orders */}
            {orderType === 'delivery' && (
              <View style={styles.deliveryTypeSection}>
                <Text style={styles.deliveryTypeLabel}>Delivery Service Type:</Text>
                <View style={styles.deliveryTypeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.deliveryTypeButton,
                      deliveryType === 'full' && styles.deliveryTypeButtonActive
                    ]}
                    onPress={() => setDeliveryType('full')}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={18}
                      color={deliveryType === 'full' ? '#fff' : '#64748b'}
                    />
                    <Text style={[
                      styles.deliveryTypeText,
                      deliveryType === 'full' && styles.deliveryTypeTextActive
                    ]}>
                      Full Service
                    </Text>
                    <Text style={[
                      styles.deliveryTypePrice,
                      deliveryType === 'full' && styles.deliveryTypePriceActive
                    ]}>
                      ${deliveryPrice.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.deliveryTypeButton,
                      deliveryType === 'pickupOnly' && styles.deliveryTypeButtonActive
                    ]}
                    onPress={() => setDeliveryType('pickupOnly')}
                  >
                    <Ionicons
                      name="arrow-up"
                      size={18}
                      color={deliveryType === 'pickupOnly' ? '#fff' : '#64748b'}
                    />
                    <Text style={[
                      styles.deliveryTypeText,
                      deliveryType === 'pickupOnly' && styles.deliveryTypeTextActive
                    ]}>
                      Pickup Only
                    </Text>
                    <Text style={[
                      styles.deliveryTypePrice,
                      deliveryType === 'pickupOnly' && styles.deliveryTypePriceActive
                    ]}>
                      ${(deliveryPrice / 2).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.deliveryTypeButton,
                      deliveryType === 'deliveryOnly' && styles.deliveryTypeButtonActive
                    ]}
                    onPress={() => setDeliveryType('deliveryOnly')}
                  >
                    <Ionicons
                      name="arrow-down"
                      size={18}
                      color={deliveryType === 'deliveryOnly' ? '#fff' : '#64748b'}
                    />
                    <Text style={[
                      styles.deliveryTypeText,
                      deliveryType === 'deliveryOnly' && styles.deliveryTypeTextActive
                    ]}>
                      Delivery Only
                    </Text>
                    <Text style={[
                      styles.deliveryTypePrice,
                      deliveryType === 'deliveryOnly' && styles.deliveryTypePriceActive
                    ]}>
                      ${(deliveryPrice / 2).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Same Day Service */}
          <View style={styles.section}>
            <View style={[styles.sameDayCard, isSameDay && styles.sameDayCardActive]}>
              <View style={styles.sameDayRow}>
                <View style={styles.sameDayInfo}>
                  <Ionicons
                    name="flash"
                    size={24}
                    color={isSameDay ? '#f59e0b' : '#94a3b8'}
                  />
                  <View>
                    <Text style={styles.sameDayTitle}>Same Day Service</Text>
                    {settings && (
                      <Text style={styles.sameDaySubtitle}>
                        ${settings.pricePerPound?.toFixed(2)}/lb → ${getSameDayPricePerPound().toFixed(2)}/lb
                      </Text>
                    )}
                  </View>
                </View>
                <Switch
                  value={isSameDay}
                  onValueChange={setIsSameDay}
                  trackColor={{ false: '#e2e8f0', true: '#fcd34d' }}
                  thumbColor={isSameDay ? '#f59e0b' : '#fff'}
                />
              </View>
              {isSameDay && settings && weight > 0 && (
                <View style={styles.sameDayPricing}>
                  <Text style={styles.sameDayPricingText}>
                    Extra charge: ${getSameDayExtraCharge().toFixed(2)}
                    {getSameDayExtraCharge() === (settings.sameDayMinimumCharge || 5) &&
                     (weight * (settings.sameDayExtraCentsPerPound || 0.33)) < (settings.sameDayMinimumCharge || 5) && (
                      <Text style={styles.minimumNote}> (minimum charge)</Text>
                    )}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Schedule Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule</Text>
            <View style={styles.card}>
              {/* Pickup/Drop-off Date - automatically set when order is picked up */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {orderType === 'delivery' ? 'Pickup Date/Time' : 'Drop-off Date/Time'}
                </Text>
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity
                    style={[styles.dateButton, styles.dateButtonFlex]}
                    onPress={() => setShowDatePicker('dropoff')}
                  >
                    <Ionicons name="calendar-outline" size={20} color="#64748b" />
                    <Text style={styles.dateButtonText}>
                      {dropOffDate
                        ? `${dropOffDate.toLocaleDateString('en-US', { weekday: 'short' })}, ${dropOffDate.toLocaleDateString('en-US', { month: 'short' })} ${dropOffDate.getDate()}, ${dropOffDate.getFullYear()}`
                        : 'Select date'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dateButton, styles.timeButtonFlex]}
                    onPress={() => setShowTimePicker('dropoff')}
                  >
                    <Ionicons name="time-outline" size={20} color="#64748b" />
                    <Text style={styles.dateButtonText}>
                      {dropOffDate
                        ? dropOffDate.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                        : '12:00 PM'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Delivery Schedule - only for delivery orders */}
              {orderType === 'delivery' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Delivery Date/Time</Text>
                  <View style={styles.dateTimeRow}>
                    <TouchableOpacity
                      style={[styles.dateButton, styles.dateButtonFlex]}
                      onPress={() => setShowDatePicker('delivery')}
                    >
                      <Ionicons name="calendar-outline" size={20} color="#64748b" />
                      <Text style={styles.dateButtonText}>
                        {deliverySchedule
                          ? `${deliverySchedule.toLocaleDateString('en-US', { weekday: 'short' })}, ${deliverySchedule.toLocaleDateString('en-US', { month: 'short' })} ${deliverySchedule.getDate()}, ${deliverySchedule.getFullYear()}`
                          : 'Select date'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dateButton, styles.timeButtonFlex]}
                      onPress={() => setShowTimePicker('delivery')}
                    >
                      <Ionicons name="time-outline" size={20} color="#64748b" />
                      <Text style={styles.dateButtonText}>
                        {deliverySchedule
                          ? deliverySchedule.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : '5:00 PM'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Date Picker Modal */}
          <Modal
            visible={showDatePicker !== null}
            transparent={true}
            animationType="slide"
          >
            <View style={styles.datePickerModalOverlay}>
              <View style={styles.datePickerModalContent}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowDatePicker(null)}>
                    <Text style={styles.datePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.datePickerTitle}>Select Date</Text>
                  <TouchableOpacity onPress={() => {
                    // Set the date to current picker value if not already set
                    if (showDatePicker === 'pickup' && !estimatedPickupDate) {
                      setEstimatedPickupDate(new Date());
                    } else if (showDatePicker === 'dropoff' && !dropOffDate) {
                      setDropOffDate(new Date());
                    } else if (showDatePicker === 'delivery' && !deliverySchedule) {
                      setDeliverySchedule(new Date());
                    }
                    setShowDatePicker(null);
                  }}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerSelectedDisplay}>
                  <Text style={styles.datePickerSelectedText}>
                    {(() => {
                      const date = showDatePicker === 'pickup'
                        ? estimatedPickupDate || new Date()
                        : showDatePicker === 'dropoff'
                        ? dropOffDate || new Date()
                        : deliverySchedule || new Date();
                      return `${date.toLocaleDateString('en-US', { weekday: 'short' })}, ${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate()}, ${date.getFullYear()}`;
                    })()}
                  </Text>
                </View>
                <DateTimePicker
                  value={
                    showDatePicker === 'pickup'
                      ? estimatedPickupDate || new Date()
                      : showDatePicker === 'dropoff'
                      ? dropOffDate || new Date()
                      : deliverySchedule || new Date()
                  }
                  mode="date"
                  display="spinner"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      if (showDatePicker === 'pickup') {
                        const newDate = estimatedPickupDate ? new Date(estimatedPickupDate) : new Date();
                        newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                        setEstimatedPickupDate(newDate);
                      } else if (showDatePicker === 'dropoff') {
                        const newDate = dropOffDate ? new Date(dropOffDate) : new Date();
                        newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                        setDropOffDate(newDate);
                      } else {
                        const newDate = deliverySchedule ? new Date(deliverySchedule) : new Date();
                        newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                        setDeliverySchedule(newDate);
                      }
                    }
                  }}
                  style={styles.datePickerSpinner}
                />
              </View>
            </View>
          </Modal>

          {/* Time Picker Modal */}
          <Modal
            visible={showTimePicker !== null}
            transparent={true}
            animationType="slide"
          >
            <View style={styles.datePickerModalOverlay}>
              <View style={styles.datePickerModalContent}>
                <View style={styles.datePickerHeader}>
                  <TouchableOpacity onPress={() => setShowTimePicker(null)}>
                    <Text style={styles.datePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.datePickerTitle}>Select Time</Text>
                  <TouchableOpacity onPress={() => {
                    // Set the time to current picker value if not already set
                    if (showTimePicker === 'pickup' && !estimatedPickupDate) {
                      setEstimatedPickupDate(new Date());
                    } else if (showTimePicker === 'dropoff' && !dropOffDate) {
                      setDropOffDate(new Date());
                    } else if (showTimePicker === 'delivery' && !deliverySchedule) {
                      setDeliverySchedule(new Date());
                    }
                    setShowTimePicker(null);
                  }}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerSelectedDisplay}>
                  <Text style={styles.datePickerSelectedText}>
                    {(() => {
                      const date = showTimePicker === 'pickup'
                        ? estimatedPickupDate || new Date()
                        : showTimePicker === 'dropoff'
                        ? dropOffDate || new Date()
                        : deliverySchedule || new Date();
                      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    })()}
                  </Text>
                </View>
                <DateTimePicker
                  value={
                    showTimePicker === 'pickup'
                      ? estimatedPickupDate || new Date()
                      : showTimePicker === 'dropoff'
                      ? dropOffDate || new Date()
                      : deliverySchedule || new Date()
                  }
                  mode="time"
                  display="spinner"
                  onChange={(event, selectedTime) => {
                    if (selectedTime) {
                      if (showTimePicker === 'pickup') {
                        const newDate = estimatedPickupDate ? new Date(estimatedPickupDate) : new Date();
                        newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
                        setEstimatedPickupDate(newDate);
                      } else if (showTimePicker === 'dropoff') {
                        const newDate = dropOffDate ? new Date(dropOffDate) : new Date();
                        newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
                        setDropOffDate(newDate);
                      } else {
                        const newDate = deliverySchedule ? new Date(deliverySchedule) : new Date();
                        newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
                        setDeliverySchedule(newDate);
                      }
                    }
                  }}
                  style={styles.datePickerSpinner}
                />
              </View>
            </View>
          </Modal>

          {/* Bags */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Bags ({bags.length}) - Total: {weight.toFixed(1)} lbs
              </Text>
              <TouchableOpacity style={styles.addButton} onPress={addBag}>
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addButtonText}>Add Bag</Text>
              </TouchableOpacity>
            </View>

            {bags.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No bags added. Tap "Add Bag" to get started.</Text>
              </View>
            ) : (
              bags.map((bag, index) => (
                <View key={index} style={styles.bagCard}>
                  <View style={styles.bagHeader}>
                    <Text style={styles.bagTitle}>Bag {index + 1}</Text>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeBag(index)}
                    >
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.bagFields}>
                    <View style={styles.bagField}>
                      <Text style={styles.bagFieldLabel}>Weight (lbs)</Text>
                      <TextInput
                        style={styles.bagInput}
                        value={bag.weight && bag.weight > 0 ? bag.weight.toString() : ''}
                        onChangeText={(text) => updateBag(index, 'weight', parseFloat(text) || 0)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>
                    <View style={styles.bagField}>
                      <Text style={styles.bagFieldLabel}>Color</Text>
                      <TextInput
                        style={styles.bagInput}
                        value={bag.color || ''}
                        onChangeText={(text) => updateBag(index, 'color', text)}
                        placeholder="Color"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>
                    <View style={styles.bagField}>
                      <Text style={styles.bagFieldLabel}>Description</Text>
                      <TextInput
                        style={styles.bagInput}
                        value={bag.description || ''}
                        onChangeText={(text) => updateBag(index, 'description', text)}
                        placeholder="Description"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Extra Items */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Extra Items</Text>
              <TouchableOpacity
                style={styles.addExtraItemsButton}
                onPress={() => setShowExtraItemsModal(true)}
              >
                <Ionicons name="add-circle" size={16} color="#fff" />
                <Text style={styles.addExtraItemsButtonText}>Add Extra Item</Text>
              </TouchableOpacity>
            </View>
            {Object.keys(selectedExtraItems).filter(id => selectedExtraItems[id]?.quantity > 0).length === 0 && (
              <View style={styles.noExtrasCard}>
                <Text style={styles.noExtrasText}>No extra items added</Text>
                <Text style={styles.noExtrasHint}>Tap "Add Extra Item" to add items</Text>
              </View>
            )}
            {Object.entries(selectedExtraItems)
              .filter(([_, data]) => data.quantity > 0)
              .map(([itemId, data]) => {
                const item = extraItems.find(e => e._id === itemId);
                if (!item) return null;
                const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                const totalWeight = calculateTotalWeight();
                const displayQty = isWeightBased ? calculateWeightBasedQuantity(totalWeight, item.perWeightUnit!) : data.quantity;
                // Use overrideTotal if set, otherwise calculate
                const calculatedPrice = isWeightBased
                  ? calculateWeightBasedPrice(totalWeight, item.perWeightUnit!, data.price)
                  : data.price * data.quantity;
                const displayPrice = data.overrideTotal !== undefined ? data.overrideTotal : calculatedPrice;
                const hasOverride = data.overrideTotal !== undefined;
                return (
                  <View key={itemId} style={styles.extraItemCard}>
                    <View style={styles.extraItemHeader}>
                      <Text style={styles.extraItemTitle}>{item.name}</Text>
                      <TouchableOpacity
                        onPress={() => removeExtraItem(itemId)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.extraItemDeleteButton}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.extraItemRow}>
                      <View style={styles.extraItemField}>
                        <Text style={styles.extraItemFieldLabel}>Override Total (optional)</Text>
                        <TextInput
                          style={[styles.extraItemInput, hasOverride && styles.extraItemInputOverride]}
                          defaultValue={hasOverride ? data.overrideTotal?.toString() : ''}
                          onEndEditing={(e) => {
                            const v = e.nativeEvent.text;
                            const val = parseFloat(v);
                            updateExtraItem(itemId, 'overrideTotal', v === '' ? undefined : (isNaN(val) ? undefined : val));
                          }}
                          keyboardType="decimal-pad"
                          placeholder={`Auto: $${calculatedPrice.toFixed(2)}`}
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                      <View style={styles.extraItemTotalBox}>
                        <Text style={styles.extraItemTotalLabel}>Total</Text>
                        <Text style={[styles.extraItemTotalValue, hasOverride && { color: '#ef4444' }]}>
                          ${displayPrice.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
          </View>

          {/* Special Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Special Instructions</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: '#fff' }]}
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              placeholder="Any special instructions..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Customer Credit - only show if customer has credit */}
          {order?.customer && (order.customer.credit || 0) > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Customer Credit</Text>
              <View style={styles.creditCard}>
                <View style={styles.creditHeader}>
                  <View style={styles.creditInfo}>
                    <Ionicons name="wallet" size={24} color="#10b981" />
                    <View>
                      <Text style={styles.creditLabel}>Available Credit</Text>
                      <Text style={styles.creditAmount}>${(order.customer.credit || 0).toFixed(2)}</Text>
                    </View>
                  </View>
                  <Switch
                    value={applyCredit}
                    onValueChange={(value) => {
                      setApplyCredit(value);
                      if (value) {
                        const available = order.customer?.credit || 0;
                        const total = getFinalPrice();
                        setCreditToApply(Math.min(available, total));
                      } else {
                        setCreditToApply(0);
                      }
                    }}
                    trackColor={{ false: '#e2e8f0', true: '#86efac' }}
                    thumbColor={applyCredit ? '#10b981' : '#94a3b8'}
                  />
                </View>
                {applyCredit && creditToApply > 0 && (
                  <View style={styles.creditApplied}>
                    <Text style={styles.creditAppliedText}>
                      Credit Applied: -${creditToApply.toFixed(2)}
                    </Text>
                    <Text style={styles.creditFinalTotal}>
                      Final Total: ${Math.max(0, getFinalPrice() - creditToApply).toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Pricing */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pricing</Text>
            <View style={styles.pricingCard}>
              {settings && weight > 0 && (
                <View style={styles.priceBreakdown}>
                  {weight <= settings.minimumWeight ? (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>
                        Base (up to {settings.minimumWeight} lbs)
                      </Text>
                      <Text style={styles.priceValue}>
                        ${settings.minimumPrice.toFixed(2)}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.priceRow}>
                        <Text style={styles.priceLabel}>
                          Base (first {settings.minimumWeight} lbs)
                        </Text>
                        <Text style={styles.priceValue}>
                          ${settings.minimumPrice.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.priceRow}>
                        <Text style={styles.priceLabel}>
                          Extra {(weight - settings.minimumWeight).toFixed(1)} lbs × ${settings.pricePerPound.toFixed(2)}
                        </Text>
                        <Text style={styles.priceValue}>
                          ${((weight - settings.minimumWeight) * settings.pricePerPound).toFixed(2)}
                        </Text>
                      </View>
                    </>
                  )}
                  {isSameDay && (
                    <View style={styles.priceRow}>
                      <Text style={[styles.priceLabel, { color: '#f59e0b' }]}>Same Day Extra</Text>
                      <Text style={[styles.priceValue, { color: '#f59e0b' }]}>
                        +${getSameDayExtraCharge().toFixed(2)}
                      </Text>
                    </View>
                  )}
                  {Object.entries(selectedExtraItems).filter(([, data]) => data.quantity > 0).length > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Extra Items</Text>
                      <Text style={styles.priceValue}>
                        +${Object.entries(selectedExtraItems).reduce((total, [itemId, data]) => {
                          // Use override total if set (for any item type)
                          if (data.overrideTotal !== undefined && data.overrideTotal !== null) {
                            return total + data.overrideTotal;
                          }
                          const item = extraItems.find(e => e._id === itemId);
                          const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
                          if (isWeightBased) {
                            return total + calculateWeightBasedPrice(calculateTotalWeight(), item.perWeightUnit!, data.price);
                          }
                          return total + (data.price * data.quantity);
                        }, 0).toFixed(2)}
                      </Text>
                    </View>
                  )}
                  {orderType === 'delivery' && deliveryPrice > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>
                        Delivery Fee{deliveryType !== 'full' ? ` (${deliveryType === 'pickupOnly' ? 'Pickup Only' : 'Delivery Only'})` : ''}
                      </Text>
                      <Text style={styles.priceValue}>
                        +${(deliveryType === 'pickupOnly' || deliveryType === 'deliveryOnly' ? deliveryPrice / 2 : deliveryPrice).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Calculated Total</Text>
                <Text style={styles.totalValue}>${calculateTotalPrice().toFixed(2)}</Text>
              </View>

              {priceOverride !== null && (
                <View style={[styles.totalRow, { marginTop: 8 }]}>
                  <Text style={[styles.totalLabel, { color: '#ef4444' }]}>Override Price</Text>
                  <Text style={[styles.totalValue, { color: '#ef4444' }]}>
                    ${priceOverride.toFixed(2)}
                  </Text>
                </View>
              )}

              {!showPriceOverride ? (
                <TouchableOpacity
                  style={styles.overrideButton}
                  onPress={() => {
                    setShowPriceOverride(true);
                    setPriceOverride(calculateTotalPrice());
                  }}
                >
                  <Text style={styles.overrideButtonText}>Override Price</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.overrideSection}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Override Price ($)</Text>
                    <TextInput
                      style={styles.input}
                      value={priceOverride?.toString() || ''}
                      onChangeText={(text) => setPriceOverride(parseFloat(text) || 0)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Reason for Price Change *</Text>
                    <TextInput
                      style={styles.input}
                      value={priceChangeNote}
                      onChangeText={setPriceChangeNote}
                      placeholder="e.g., Customer discount"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.removeOverrideButton}
                    onPress={() => {
                      setShowPriceOverride(false);
                      setPriceOverride(null);
                      setPriceChangeNote('');
                    }}
                  >
                    <Text style={styles.removeOverrideText}>Remove Price Override</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            {isAdmin && (
              <TouchableOpacity
                style={[styles.deleteButton, saving && styles.buttonDisabled]}
                onPress={handleDelete}
                disabled={saving}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.deleteButtonText}>Delete Order</Text>
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

          <View style={{ height: 100 }} />
      </KeyboardAwareScrollView>

      {/* Extra Items Modal */}
      <Modal
        visible={showExtraItemsModal}
        animationType="slide"
        onRequestClose={() => setShowExtraItemsModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.modalTitle}>Select Extra Items</Text>
            <TouchableOpacity onPress={() => setShowExtraItemsModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={28} color="#1e293b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {extraItems.length === 0 ? (
              <Text style={styles.modalEmptyText}>No extra items available</Text>
            ) : (
              extraItems.map((item) => {
                const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                const totalWeight = calculateTotalWeight();
                const autoQuantity = isWeightBased ? calculateWeightBasedQuantity(totalWeight, item.perWeightUnit!) : 0;
                const data = selectedExtraItems[item._id] || { quantity: 0, price: item.price };
                const quantity = isWeightBased ? (data.quantity > 0 ? autoQuantity : 0) : data.quantity;
                const customPrice = data.price;
                const isEnabled = data.quantity > 0 || (selectedExtraItems[item._id] !== undefined);
                // Calculate price with minimum applied for weight-based items
                const calculatedPrice = isWeightBased
                  ? calculateWeightBasedPrice(totalWeight, item.perWeightUnit!, customPrice)
                  : 0;

                return (
                  <View key={item._id} style={[styles.modalItemCard, quantity > 0 && styles.modalItemCardSelected]}>
                    <View style={styles.modalItemHeader}>
                      <View style={styles.modalItemInfo}>
                        <Text style={styles.modalItemName}>{item.name}</Text>
                        <Text style={styles.modalItemBasePrice}>
                          ${item.price.toFixed(2)}{isWeightBased ? ` per ${item.perWeightUnit} lbs` : ''}
                        </Text>
                        {item.description && (
                          <Text style={styles.modalItemDescription}>{item.description}</Text>
                        )}
                        {isWeightBased && totalWeight > 0 && isEnabled && (
                          <Text style={styles.modalWeightCalc}>
                            {totalWeight} lbs ÷ {item.perWeightUnit} = {autoQuantity} unit{autoQuantity !== 1 ? 's' : ''}
                          </Text>
                        )}
                        {isWeightBased && totalWeight === 0 && (
                          <Text style={styles.modalWeightHint}>Add bag weight to calculate</Text>
                        )}
                      </View>
                      {isWeightBased ? (
                        // Weight-based items use a toggle switch
                        <Switch
                          value={isEnabled}
                          onValueChange={(enabled) => {
                            if (enabled) {
                              setSelectedExtraItems(prev => ({
                                ...prev,
                                [item._id]: { quantity: autoQuantity, price: item.price }
                              }));
                            } else {
                              setSelectedExtraItems(prev => {
                                const { [item._id]: _, ...rest } = prev;
                                return rest;
                              });
                            }
                          }}
                          trackColor={{ false: '#e2e8f0', true: '#c4b5fd' }}
                          thumbColor={isEnabled ? '#8b5cf6' : '#f4f4f5'}
                        />
                      ) : (
                        // Regular items use +/- quantity controls
                        <View style={styles.modalQuantityControl}>
                          <TouchableOpacity
                            style={[styles.modalQuantityButton, quantity === 0 && styles.modalQuantityButtonDisabled]}
                            onPress={() => setSelectedExtraItems(prev => {
                              const current = prev[item._id] || { quantity: 0, price: item.price };
                              const newQty = Math.max(0, current.quantity - 1);
                              if (newQty === 0) {
                                const { [item._id]: _, ...rest } = prev;
                                return rest;
                              }
                              return { ...prev, [item._id]: { ...current, quantity: newQty } };
                            })}
                            disabled={quantity === 0}
                          >
                            <Ionicons name="remove" size={20} color={quantity === 0 ? '#94a3b8' : '#2563eb'} />
                          </TouchableOpacity>
                          <Text style={styles.modalQuantityText}>{quantity}</Text>
                          <TouchableOpacity
                            style={styles.modalQuantityButton}
                            onPress={() => setSelectedExtraItems(prev => {
                              const current = prev[item._id] || { quantity: 0, price: item.price };
                              return { ...prev, [item._id]: { ...current, quantity: current.quantity + 1 } };
                            })}
                          >
                            <Ionicons name="add" size={20} color="#2563eb" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {quantity > 0 && (
                      <View style={styles.modalPriceEditRow}>
                        {isWeightBased ? (
                          <>
                            <Text style={styles.modalPriceLabel}>Final price:</Text>
                            <View style={styles.modalPriceInputContainer}>
                              <Text style={styles.modalPriceDollar}>$</Text>
                              <TextInput
                                style={[styles.modalPriceInput, data.overrideTotal !== undefined && styles.modalPriceInputOverride]}
                                defaultValue={data.overrideTotal !== undefined ? data.overrideTotal.toString() : calculatedPrice.toFixed(2)}
                                onChangeText={(text) => {
                                  const newTotal = parseFloat(text) || 0;
                                  if (newTotal !== calculatedPrice) {
                                    setSelectedExtraItems(prev => ({
                                      ...prev,
                                      [item._id]: { ...prev[item._id], overrideTotal: newTotal }
                                    }));
                                  } else {
                                    // If they enter the calculated price, remove override
                                    setSelectedExtraItems(prev => ({
                                      ...prev,
                                      [item._id]: { ...prev[item._id], overrideTotal: undefined }
                                    }));
                                  }
                                }}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectTextOnFocus={true}
                                placeholder={calculatedPrice.toFixed(2)}
                                placeholderTextColor="#94a3b8"
                              />
                            </View>
                            {data.overrideTotal !== undefined && (
                              <TouchableOpacity
                                onPress={() => setSelectedExtraItems(prev => ({
                                  ...prev,
                                  [item._id]: { ...prev[item._id], overrideTotal: undefined }
                                }))}
                                style={styles.modalClearOverride}
                              >
                                <Ionicons name="close-circle" size={20} color="#ef4444" />
                              </TouchableOpacity>
                            )}
                          </>
                        ) : (
                          <>
                            <Text style={styles.modalPriceLabel}>Price per item:</Text>
                            <View style={styles.modalPriceInputContainer}>
                              <Text style={styles.modalPriceDollar}>$</Text>
                              <TextInput
                                style={styles.modalPriceInput}
                                value={customPrice.toString()}
                                onChangeText={(text) => {
                                  const newPrice = parseFloat(text) || 0;
                                  setSelectedExtraItems(prev => ({
                                    ...prev,
                                    [item._id]: { ...prev[item._id], price: newPrice }
                                  }));
                                }}
                                keyboardType="decimal-pad"
                                placeholder={item.price.toString()}
                                placeholderTextColor="#94a3b8"
                              />
                            </View>
                            <Text style={styles.modalItemTotal}>= ${(customPrice * quantity).toFixed(2)}</Text>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Selected items summary */}
          {Object.keys(selectedExtraItems).filter(id => selectedExtraItems[id]?.quantity > 0).length > 0 && (
            <View style={styles.modalSummary}>
              <Text style={styles.modalSummaryTitle}>Selected Items:</Text>
              {Object.entries(selectedExtraItems)
                .filter(([_, data]) => data.quantity > 0)
                .map(([itemId, data]) => {
                  const item = extraItems.find(i => i._id === itemId);
                  if (!item) return null;
                  const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                  const totalWeight = calculateTotalWeight();
                  const displayQty = isWeightBased ? calculateWeightBasedQuantity(totalWeight, item.perWeightUnit!) : data.quantity;
                  // Use calculateWeightBasedPrice for weight-based items (applies minimum)
                  const itemTotal = isWeightBased
                    ? (data.overrideTotal !== undefined ? data.overrideTotal : calculateWeightBasedPrice(totalWeight, item.perWeightUnit!, data.price))
                    : data.price * data.quantity;
                  return (
                    <View key={itemId} style={styles.modalSummaryRow}>
                      <Text style={styles.modalSummaryText}>{item.name}</Text>
                      <Text style={[styles.modalSummaryPrice, data.overrideTotal !== undefined && { color: '#ef4444' }]}>
                        ${itemTotal.toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              <View style={styles.modalSummaryTotal}>
                <Text style={styles.modalSummaryTotalLabel}>Total:</Text>
                <Text style={styles.modalSummaryTotalValue}>
                  ${Object.entries(selectedExtraItems)
                    .reduce((sum, [itemId, data]) => {
                      const item = extraItems.find(i => i._id === itemId);
                      const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
                      const totalWeight = calculateTotalWeight();
                      if (isWeightBased) {
                        if (data.overrideTotal !== undefined) {
                          return sum + data.overrideTotal;
                        }
                        return sum + calculateWeightBasedPrice(totalWeight, item.perWeightUnit!, data.price);
                      }
                      return sum + data.price * data.quantity;
                    }, 0)
                    .toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalClearButton}
              onPress={() => {
                Keyboard.dismiss();
                setSelectedExtraItems({});
                setTimeout(() => setShowExtraItemsModal(false), 100);
              }}
            >
              <Text style={styles.modalClearButtonText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalDoneButton}
              onPress={() => {
                Keyboard.dismiss();
                setTimeout(() => setShowExtraItemsModal(false), 100);
              }}
            >
              <Text style={styles.modalDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
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
    backgroundColor: '#1e293b',
    padding: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
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
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 12,
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
  orderTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  orderTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
  },
  orderTypeButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  orderTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  orderTypeTextActive: {
    color: '#fff',
  },
  // Delivery type styles
  deliveryTypeSection: {
    marginTop: 12,
  },
  deliveryTypeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 8,
  },
  deliveryTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  deliveryTypeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
  },
  deliveryTypeButtonActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  deliveryTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 4,
  },
  deliveryTypeTextActive: {
    color: '#fff',
  },
  deliveryTypePrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  deliveryTypePriceActive: {
    color: '#fff',
  },
  sameDayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  sameDayCardActive: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  sameDayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sameDayInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sameDayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  sameDaySubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  sameDayPricing: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#fcd34d',
  },
  sameDayPricingText: {
    fontSize: 14,
    color: '#92400e',
  },
  minimumNote: {
    fontStyle: 'italic',
    color: '#d97706',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#e2e8f0',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  bagCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bagTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  removeButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  removeButtonText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  bagFields: {
    flexDirection: 'row',
    gap: 8,
  },
  bagField: {
    flex: 1,
  },
  bagFieldLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  bagInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: '#1e293b',
  },
  // Extra items button and summary
  addExtraItemsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addExtraItemsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  selectedExtrasCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  selectedExtraRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  selectedExtraName: {
    fontSize: 15,
    color: '#1e293b',
  },
  selectedExtraPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  selectedExtraHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  noExtrasCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  noExtrasText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  noExtrasHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  // Extra item card styles (like bags)
  extraItemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  extraItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  extraItemDeleteButton: {
    padding: 4,
  },
  extraItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  extraItemRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  extraItemField: {
    flex: 1,
  },
  extraItemFieldLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  extraItemInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  extraItemInputOverride: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  extraItemReadOnly: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  extraItemReadOnlyText: {
    fontSize: 15,
    color: '#64748b',
  },
  extraItemHint: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  extraItemTotalBox: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraItemTotalLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 2,
  },
  extraItemTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  extraItemMinNote: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingTop: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalEmptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#64748b',
    marginTop: 40,
  },
  modalItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modalItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  modalItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  modalItemPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10b981',
  },
  modalItemDescription: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  modalWeightCalc: {
    fontSize: 13,
    color: '#8b5cf6',
    fontWeight: '600',
    marginTop: 6,
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  modalWeightHint: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  modalQuantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalQuantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  modalQuantityButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  modalQuantityText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    minWidth: 24,
    textAlign: 'center',
  },
  modalSummary: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    padding: 16,
  },
  modalSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  modalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  modalSummaryText: {
    fontSize: 14,
    color: '#1e293b',
  },
  modalSummaryCalc: {
    fontSize: 12,
    color: '#8b5cf6',
    marginTop: 2,
  },
  modalSummaryPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  modalSummaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalSummaryTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  modalSummaryTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalClearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  modalClearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  modalDoneButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  modalDoneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Customer credit styles
  creditCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  creditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditLabel: {
    fontSize: 14,
    color: '#065f46',
  },
  creditAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10b981',
  },
  creditApplied: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#a7f3d0',
  },
  creditAppliedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  creditFinalTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#047857',
    marginTop: 4,
  },
  pricingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  priceBreakdown: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10b981',
  },
  overrideButton: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    alignItems: 'center',
  },
  overrideButtonText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  overrideSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  removeOverrideButton: {
    padding: 8,
    alignItems: 'center',
  },
  removeOverrideText: {
    color: '#ef4444',
    fontSize: 14,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#1e293b',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateButtonFlex: {
    flex: 2,
  },
  timeButtonFlex: {
    flex: 1,
  },
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  datePickerHeader: {
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
  datePickerSelectedDisplay: {
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center',
  },
  datePickerSelectedText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
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
  // Modal price editing styles
  modalItemCardSelected: {
    flexDirection: 'column' as const,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  modalItemHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  modalItemBasePrice: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  modalPriceEditRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalPriceLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#1e293b',
    marginRight: 8,
  },
  modalPriceInputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flex: 1,
    marginRight: 16,
  },
  modalPriceDollar: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: '#64748b',
    marginRight: 4,
  },
  modalPriceInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1e293b',
    padding: 0,
  },
  modalPriceInputOverride: {
    color: '#ef4444',
  },
  modalClearOverride: {
    marginLeft: 8,
    padding: 4,
  },
  modalItemTotal: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#10b981',
  },
});
