import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  Keyboard,
  Modal,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../services/api';
import { localPrinter } from '../services/LocalPrinter';
import { generateCustomerReceiptText, generateStoreCopyText, generateBagLabelText } from '../services/receiptGenerator';
import AddressInput from '../components/AddressInput';
import type { Customer, Settings, ExtraItem, PaymentMethod } from '../types';

// Format date as "Tue, Jan 12, 2026, 11:45 AM"
function formatPickupDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${dayName}, ${monthName} ${dayNum}, ${year}, ${hours}:${minutes} ${ampm}`;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
];

interface Bag {
  identifier: string;
  weight: number;
  color: string;
  description: string;
}

export default function CreateOrderScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [orderType, setOrderType] = useState<'storePickup' | 'delivery'>('storePickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [manualDeliveryFee, setManualDeliveryFee] = useState('');
  const [bags, setBags] = useState<Bag[]>([]);
  const [isSameDay, setIsSameDay] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<Record<string, { quantity: number; price: number; overrideTotal?: number }>>({});
  const [showExtraItemsModal, setShowExtraItemsModal] = useState(false);
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Customer credit
  const [applyCredit, setApplyCredit] = useState(false);
  const [creditToApply, setCreditToApply] = useState(0);

  // Quick add customer
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [quickAddEmail, setQuickAddEmail] = useState('');
  const [quickAddAddress, setQuickAddAddress] = useState('');
  const [quickAddDeliveryFee, setQuickAddDeliveryFee] = useState('');
  const [quickAddBuzzerCode, setQuickAddBuzzerCode] = useState('');
  const [quickAddNotes, setQuickAddNotes] = useState('');
  const [quickAddCreating, setQuickAddCreating] = useState(false);

  // Pickup date - default to tomorrow at 5 PM
  const getDefaultPickupDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(17, 0, 0, 0);
    return date;
  };
  const [estimatedPickupDate, setEstimatedPickupDate] = useState<Date>(getDefaultPickupDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Refresh selected customer data when returning from EditCustomerScreen
  useFocusEffect(
    useCallback(() => {
      if (selectedCustomer) {
        // Re-fetch the customer data to get any updates
        api.getCustomer(selectedCustomer._id)
          .then((updatedCustomer) => {
            if (updatedCustomer) {
              setSelectedCustomer(updatedCustomer);
            }
          })
          .catch((error) => {
            console.error('Failed to refresh customer:', error);
          });
      }
    }, [selectedCustomer?._id])
  );

  async function loadData() {
    try {
      const [customersData, settingsData, extrasData] = await Promise.all([
        api.getCustomers(),
        api.getSettings(),
        api.getExtraItems(),
      ]);
      setCustomers(customersData);
      setSettings(settingsData);
      setExtraItems(extrasData.filter(e => e.isActive));
    } catch (error) {
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Format phone number as user types (XXX) XXX-XXXX
  function formatPhoneNumber(text: string): string {
    const cleaned = text.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (!match) return text;

    let formatted = '';
    if (match[1]) {
      formatted = `(${match[1]}`;
      if (match[1].length === 3) {
        formatted += ') ';
        if (match[2]) {
          formatted += match[2];
          if (match[2].length === 3 && match[3]) {
            formatted += `-${match[3]}`;
          }
        }
      }
    }
    return formatted || text;
  }

  // Check if phone number already exists
  function findCustomerByPhone(phone: string): Customer | undefined {
    const cleanPhone = phone.replace(/\D/g, '');
    return customers.find(c => c.phoneNumber.replace(/\D/g, '') === cleanPhone);
  }

  // Quick add customer with duplicate check
  async function handleQuickAddCustomer() {
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

    // Check for duplicate
    const existingCustomer = findCustomerByPhone(quickAddPhone);
    if (existingCustomer) {
      Alert.alert(
        'Customer Already Exists',
        `A customer with this phone number already exists:\n\n${existingCustomer.name}\n${existingCustomer.phoneNumber}`,
        [
          { text: 'Use Existing', onPress: () => {
            setSelectedCustomer(existingCustomer);
            setShowQuickAddCustomer(false);
            setQuickAddName('');
            setQuickAddPhone('');
            setQuickAddAddress('');
            setCustomerSearch('');
            if (existingCustomer.notes) {
              setSpecialInstructions(existingCustomer.notes);
            }
          }},
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    setQuickAddCreating(true);
    try {
      const newCustomer = await api.createCustomer({
        name: quickAddName.trim(),
        phoneNumber: formatPhoneNumber(quickAddPhone),
        email: quickAddEmail.trim() || undefined,
        address: quickAddAddress.trim() || undefined,
        deliveryFee: quickAddDeliveryFee ? `$${parseFloat(quickAddDeliveryFee).toFixed(2)}` : '$0.00',
        buzzerCode: quickAddBuzzerCode.trim() || undefined,
        notes: quickAddNotes.trim() || undefined,
      });

      // Add to local customers list
      setCustomers(prev => [newCustomer, ...prev]);

      // Select the new customer
      setSelectedCustomer(newCustomer);
      setShowQuickAddCustomer(false);
      setQuickAddName('');
      setQuickAddPhone('');
      setQuickAddEmail('');
      setQuickAddAddress('');
      setQuickAddDeliveryFee('');
      setQuickAddBuzzerCode('');
      setQuickAddNotes('');
      setCustomerSearch('');

      // Set special instructions from notes if any
      if (newCustomer.notes) {
        setSpecialInstructions(newCustomer.notes);
      }

      Alert.alert('Success', `Customer "${newCustomer.name}" created!`);
    } catch (error) {
      console.error('Failed to create customer:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create customer';
      Alert.alert('Error', errorMessage);
    } finally {
      setQuickAddCreating(false);
    }
  }

  // Navigate to CreateCustomerScreen with search pre-filled
  function openQuickAddCustomer() {
    const searchText = customerSearch.trim();
    // Check if search looks like a phone number
    const isPhone = /^\d+$/.test(searchText.replace(/\D/g, '')) && searchText.replace(/\D/g, '').length >= 3;

    navigation.navigate('CreateCustomer', {
      prefillName: isPhone ? '' : searchText,
      prefillPhone: isPhone ? searchText : '',
    });
  }

  // Update customer phone number
  async function updateCustomerPhone(customer: Customer, newPhone: string) {
    try {
      const formattedPhone = formatPhoneNumber(newPhone);
      const updatedCustomer = await api.updateCustomer(customer._id, {
        phoneNumber: formattedPhone,
      });

      // Update local customers list
      setCustomers(prev => prev.map(c => c._id === customer._id ? updatedCustomer : c));

      // Select the updated customer
      setSelectedCustomer(updatedCustomer);
      setShowQuickAddCustomer(false);
      setQuickAddName('');
      setQuickAddPhone('');
      setQuickAddAddress('');
      setCustomerSearch('');

      Alert.alert('Success', `Phone number updated for ${customer.name}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update phone number');
    }
  }

  // Handle selecting existing customer with option to update phone
  function handleSelectCustomerWithPhoneOption(customer: Customer) {
    const searchText = customerSearch.trim();
    const searchIsPhone = /^\d+$/.test(searchText.replace(/\D/g, '')) && searchText.replace(/\D/g, '').length >= 7;
    const searchPhone = searchText.replace(/\D/g, '');
    const customerPhone = customer.phoneNumber.replace(/\D/g, '');

    // If searching by phone and it's different from customer's phone, offer to update
    if (searchIsPhone && searchPhone !== customerPhone && searchPhone.length >= 10) {
      Alert.alert(
        'Update Phone Number?',
        `${customer.name}'s phone is:\n${customer.phoneNumber}\n\nUpdate to new number?\n${formatPhoneNumber(searchText)}`,
        [
          { text: 'Keep Old Number', onPress: () => selectCustomer(customer) },
          { text: 'Update Phone', onPress: () => updateCustomerPhone(customer, searchText) },
        ]
      );
    } else {
      selectCustomer(customer);
    }
  }

  // Select a customer
  function selectCustomer(customer: Customer) {
    Keyboard.dismiss();
    setSelectedCustomer(customer);
    setCustomerSearch('');
    if (customer.notes) {
      setSpecialInstructions(customer.notes);
    }
    setApplyCredit(false);
    setCreditToApply(0);
  }

  // Calculate total weight from all bags
  function getTotalWeight() {
    return bags.reduce((sum, bag) => sum + (bag.weight || 0), 0);
  }

  // Calculate quantity for weight-based items (e.g., "per 15 lbs")
  // Returns the exact proportional quantity (e.g., 20lbs / 15lbs = 1.33)
  function calculateWeightBasedQuantity(perWeightUnit: number, totalWeight: number): number {
    if (perWeightUnit <= 0 || totalWeight <= 0) return 0;
    return totalWeight / perWeightUnit;
  }

  // Round amount to nearest quarter (0.25)
  function roundToNearestQuarter(amount: number): number {
    return Math.round(amount * 4) / 4;
  }

  // Update weight-based extra items when weight changes
  useEffect(() => {
    const totalWeight = getTotalWeight();
    setSelectedExtras(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      Object.keys(updated).forEach(itemId => {
        const item = extraItems.find(e => e._id === itemId);
        if (item?.perWeightUnit && item.perWeightUnit > 0) {
          const newQty = calculateWeightBasedQuantity(item.perWeightUnit, totalWeight);
          if (updated[itemId].quantity !== newQty) {
            updated[itemId] = { ...updated[itemId], quantity: newQty };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [bags, extraItems]);

  function calculateTotal() {
    if (!settings) return 0;

    const totalWeight = getTotalWeight();

    // Calculate laundry subtotal only if there's weight
    let laundrySubtotal = 0;
    let sameDayExtra = 0;

    if (totalWeight > 0) {
      const pricePerPound = settings.pricePerPound;

      // Pricing: minimum price for first X pounds, then price per pound for extra
      if (totalWeight <= settings.minimumWeight) {
        // Under or at minimum weight - charge minimum price
        laundrySubtotal = settings.minimumPrice;
      } else {
        // Over minimum weight - charge minimum + extra pounds at price per pound
        const extraPounds = totalWeight - settings.minimumWeight;
        laundrySubtotal = settings.minimumPrice + (extraPounds * pricePerPound);
      }

      // Same day extra: cents per pound with minimum
      if (isSameDay) {
        const extraCentsPerPound = settings.sameDayExtraCentsPerPound || 0.33;
        const calculatedExtra = totalWeight * extraCentsPerPound;
        const minimumCharge = settings.sameDayMinimumCharge || 5;
        sameDayExtra = Math.max(calculatedExtra, minimumCharge);
      }
    }

    // Add extras (handle weight-based items with proportional pricing rounded to nearest quarter)
    let extrasTotal = 0;
    Object.entries(selectedExtras).forEach(([itemId, data]) => {
      if (data.quantity > 0) {
        const item = extraItems.find(e => e._id === itemId);
        const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
        if (isWeightBased) {
          // Use override total if set, otherwise calculate proportionally
          if (data.overrideTotal !== undefined && data.overrideTotal !== null) {
            extrasTotal += data.overrideTotal;
          } else {
            const proportionalQty = calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight);
            const itemTotal = roundToNearestQuarter(data.price * proportionalQty);
            extrasTotal += itemTotal;
          }
        } else {
          extrasTotal += data.price * data.quantity;
        }
      }
    });

    // Add delivery fee
    let deliveryFee = 0;
    if (orderType === 'delivery' && selectedCustomer) {
      // Use manual fee if customer doesn't have one set
      if (!selectedCustomer.deliveryFee || selectedCustomer.deliveryFee === '$0.00') {
        deliveryFee = parseFloat(manualDeliveryFee) || 0;
      } else {
        deliveryFee = parseFloat(selectedCustomer.deliveryFee.replace('$', '')) || 0;
      }
    }

    return laundrySubtotal + sameDayExtra + extrasTotal + deliveryFee;
  }

  function getPriceBreakdown() {
    if (!settings) return [];

    const breakdown: { label: string; amount: number }[] = [];
    const totalWeight = getTotalWeight();

    // Laundry service
    if (totalWeight > 0) {
      const pricePerPound = settings.pricePerPound;

      if (totalWeight <= settings.minimumWeight) {
        // Under or at minimum weight - show minimum price
        breakdown.push({
          label: `Base (up to ${settings.minimumWeight} lbs)`,
          amount: settings.minimumPrice,
        });
      } else {
        // Over minimum weight - show minimum + extra pounds
        const extraPounds = totalWeight - settings.minimumWeight;

        breakdown.push({
          label: `Base (first ${settings.minimumWeight} lbs)`,
          amount: settings.minimumPrice,
        });
        breakdown.push({
          label: `Extra ${extraPounds} lbs × $${pricePerPound.toFixed(2)}/lb`,
          amount: extraPounds * pricePerPound,
        });
      }

      // Same day extra charge
      if (isSameDay) {
        const extraCentsPerPound = settings.sameDayExtraCentsPerPound || 0.33;
        const calculatedExtra = totalWeight * extraCentsPerPound;
        const minimumCharge = settings.sameDayMinimumCharge || 5;
        const sameDayCharge = Math.max(calculatedExtra, minimumCharge);
        const isMinimum = sameDayCharge === minimumCharge && calculatedExtra < minimumCharge;

        breakdown.push({
          label: isMinimum
            ? `Same Day (minimum charge)`
            : `Same Day (${totalWeight} lbs × $${extraCentsPerPound.toFixed(2)}/lb)`,
          amount: sameDayCharge,
        });
      }
    }

    // Extra items (handle weight-based items with proportional pricing)
    Object.entries(selectedExtras).forEach(([itemId, data]) => {
      const item = extraItems.find(e => e._id === itemId);
      if (item && data.quantity > 0) {
        const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
        if (isWeightBased) {
          // Use override total if set
          if (data.overrideTotal !== undefined && data.overrideTotal !== null) {
            breakdown.push({
              label: item.name,
              amount: data.overrideTotal,
            });
          } else {
            const proportionalQty = calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight);
            const itemTotal = roundToNearestQuarter(data.price * proportionalQty);
            breakdown.push({
              label: item.name,
              amount: itemTotal,
            });
          }
        } else {
          breakdown.push({
            label: `${item.name} × ${data.quantity}`,
            amount: data.price * data.quantity,
          });
        }
      }
    });

    // Delivery fee
    if (orderType === 'delivery' && selectedCustomer) {
      let fee = 0;
      if (!selectedCustomer.deliveryFee || selectedCustomer.deliveryFee === '$0.00') {
        fee = parseFloat(manualDeliveryFee) || 0;
      } else {
        fee = parseFloat(selectedCustomer.deliveryFee.replace('$', '')) || 0;
      }
      if (fee > 0) {
        breakdown.push({
          label: 'Delivery Fee',
          amount: fee,
        });
      }
    }

    return breakdown;
  }

  function addBag() {
    setBags([...bags, { identifier: `Bag ${bags.length + 1}`, weight: 0, color: '', description: '' }]);
  }

  function removeBag(index: number) {
    const newBags = bags.filter((_, i) => i !== index);
    // Re-number bags
    setBags(newBags.map((bag, i) => ({ ...bag, identifier: `Bag ${i + 1}` })));
  }

  function updateBag(index: number, field: keyof Bag, value: string | number) {
    const newBags = [...bags];
    newBags[index] = { ...newBags[index], [field]: value };
    setBags(newBags);
  }

  async function handleSubmit() {
    if (!selectedCustomer) {
      Alert.alert('Error', 'Please select a customer');
      return;
    }

    // Validate delivery address for delivery orders
    if (orderType === 'delivery' && !selectedCustomer.address && !deliveryAddress.trim()) {
      Alert.alert('Error', 'Please enter a delivery address');
      return;
    }

    const totalWeight = getTotalWeight();

    setSubmitting(true);
    try {
      // Convert selected extras to ExtraItemUsage format (handle weight-based items)
      const extraItemsData = Object.entries(selectedExtras)
        .filter(([_, data]) => data.quantity > 0)
        .map(([itemId, data]) => {
          const item = extraItems.find(e => e._id === itemId);
          const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
          const qty = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight) : data.quantity;
          return {
            itemId,
            name: item?.name || '',
            price: data.price,
            quantity: qty,
            overrideTotal: data.overrideTotal,
          };
        });

      // Use manual delivery address if customer doesn't have one
      const finalDeliveryAddress = selectedCustomer.address || deliveryAddress.trim();

      const orderData = {
        customerId: selectedCustomer._id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phoneNumber,
        deliveryAddress: orderType === 'delivery' ? finalDeliveryAddress : undefined,
        orderType,
        weight: totalWeight,
        bags: bags.filter(bag => bag.weight > 0 || bag.color || bag.description).map(bag => ({
          identifier: bag.identifier,
          weight: bag.weight,
          color: bag.color || '',
          description: bag.description || '',
        })),
        isSameDay,
        specialInstructions,
        items: [],
        extraItems: extraItemsData,
        totalAmount: calculateTotal(),
        dropOffDate: new Date(),
        estimatedPickupDate: estimatedPickupDate,
        // If credit covers full amount, mark as paid
        isPaid: markAsPaid || (applyCredit && creditToApply >= calculateTotal()),
        paymentMethod: (applyCredit && creditToApply >= calculateTotal())
          ? 'credit'
          : (markAsPaid ? paymentMethod : 'pending'),
        creditApplied: applyCredit ? creditToApply : 0,
      };

      const createdOrder = await api.createOrder(orderData);

      // Apply customer credit if selected
      if (applyCredit && creditToApply > 0 && selectedCustomer) {
        try {
          await api.useCustomerCredit(
            selectedCustomer._id,
            creditToApply,
            `Applied to Order #${createdOrder.orderId}`
          );
        } catch (creditError) {
          console.error('Failed to apply credit:', creditError);
          // Order was still created, just credit wasn't applied
        }
      }

      // Auto-print receipts for in-store pickup (drop-off) orders
      if (orderType === 'storePickup' && settings?.thermalPrinterIp) {
        try {
          const printerIp = settings.thermalPrinterIp;
          const printerPort = settings.thermalPrinterPort || 9100;
          // Print customer receipt
          const customerReceipt = generateCustomerReceiptText(createdOrder);
          await localPrinter.printReceipt(printerIp, customerReceipt, printerPort);
          // Print store copy
          const storeCopy = generateStoreCopyText(createdOrder);
          await localPrinter.printReceipt(printerIp, storeCopy, printerPort);
          // Print bag labels
          if (createdOrder.bags && createdOrder.bags.length > 0) {
            for (let i = 0; i < createdOrder.bags.length; i++) {
              const bag = createdOrder.bags[i];
              const bagLabel = generateBagLabelText(createdOrder, bag, i + 1, createdOrder.bags.length);
              await localPrinter.printReceipt(printerIp, bagLabel, printerPort);
            }
          }
        } catch (printError) {
          console.error('Auto-print failed:', printError);
          // Don't show error - order was still created successfully
        }
      }

      Alert.alert('Success', 'Order created successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phoneNumber.includes(customerSearch)
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      enableOnAndroid={true}
      extraScrollHeight={Platform.OS === 'ios' ? 120 : 80}
      extraHeight={120}
      keyboardShouldPersistTaps="handled"
      enableAutomaticScroll={true}
    >
      {/* Customer Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer</Text>
        {selectedCustomer ? (
          <View>
            <View style={styles.selectedCustomer}>
              <View style={styles.selectedCustomerInfo}>
                <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                <Text style={styles.customerPhone}>{selectedCustomer.phoneNumber}</Text>
                {selectedCustomer.address && (
                  <Text style={styles.customerAddress}>{selectedCustomer.address}</Text>
                )}
              </View>
              <View style={styles.customerActions}>
                <TouchableOpacity
                  style={styles.editCustomerButton}
                  onPress={() => {
                    navigation.navigate('EditCustomer', { customerId: selectedCustomer._id });
                  }}
                >
                  <Ionicons name="pencil" size={18} color="#2563eb" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  setSelectedCustomer(null);
                  setSpecialInstructions('');
                  setApplyCredit(false);
                  setCreditToApply(0);
                  setDeliveryAddress('');
                  setManualDeliveryFee('');
                }}>
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
            {/* Delivery Info - Show when order is delivery and customer has missing info */}
            {orderType === 'delivery' && (!selectedCustomer.address || !selectedCustomer.deliveryFee || selectedCustomer.deliveryFee === '$0.00') && (
              <View style={styles.deliveryInfoSection}>
                <Text style={styles.deliveryInfoTitle}>
                  <Ionicons name="car" size={16} color="#f59e0b" /> Delivery Information Required
                </Text>
                {!selectedCustomer.address && (
                  <View style={styles.deliveryInputGroup}>
                    <Text style={styles.deliveryInputLabel}>Delivery Address *</Text>
                    <TextInput
                      style={styles.deliveryAddressInput}
                      value={deliveryAddress}
                      onChangeText={setDeliveryAddress}
                      placeholder="Enter delivery address..."
                      placeholderTextColor="#94a3b8"
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                )}
                {(!selectedCustomer.deliveryFee || selectedCustomer.deliveryFee === '$0.00') && (
                  <View style={styles.deliveryInputGroup}>
                    <Text style={styles.deliveryInputLabel}>Delivery Fee ($)</Text>
                    <TextInput
                      style={styles.deliveryFeeInput}
                      value={manualDeliveryFee}
                      onChangeText={setManualDeliveryFee}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="decimal-pad"
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <View>
            <TextInput
              style={styles.searchInput}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search by name or phone..."
              placeholderTextColor="#94a3b8"
            />
            {customerSearch.length > 0 && (
              <View style={styles.customerList}>
                {filteredCustomers.slice(0, 5).map(customer => (
                  <TouchableOpacity
                    key={customer._id}
                    style={styles.customerItem}
                    onPress={() => handleSelectCustomerWithPhoneOption(customer)}
                  >
                    <Text style={styles.customerItemName}>{customer.name}</Text>
                    <Text style={styles.customerItemPhone}>{customer.phoneNumber}</Text>
                  </TouchableOpacity>
                ))}
                {/* Quick Add Customer Button */}
                <TouchableOpacity
                  style={styles.quickAddButton}
                  onPress={openQuickAddCustomer}
                >
                  <Ionicons name="person-add" size={20} color="#2563eb" />
                  <Text style={styles.quickAddButtonText}>
                    {filteredCustomers.length === 0 ? 'Add New Customer' : 'Add as New Customer'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Order Type */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Type</Text>
        <View style={styles.typeButtons}>
          <TouchableOpacity
            style={[styles.typeButton, orderType === 'storePickup' && styles.typeButtonActive]}
            onPress={() => setOrderType('storePickup')}
          >
            <Ionicons
              name="storefront"
              size={24}
              color={orderType === 'storePickup' ? '#fff' : '#64748b'}
            />
            <Text style={[styles.typeButtonText, orderType === 'storePickup' && styles.typeButtonTextActive]}>
              In-Store
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, orderType === 'delivery' && styles.typeButtonActive]}
            onPress={() => setOrderType('delivery')}
          >
            <Ionicons
              name="car"
              size={24}
              color={orderType === 'delivery' ? '#fff' : '#64748b'}
            />
            <Text style={[styles.typeButtonText, orderType === 'delivery' && styles.typeButtonTextActive]}>
              Delivery
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bags */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Bags</Text>
          <TouchableOpacity style={styles.addBagButton} onPress={addBag}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBagText}>Add Bag</Text>
          </TouchableOpacity>
        </View>
        {bags.length === 0 && (
          <View style={styles.emptyBagsCard}>
            <Text style={styles.emptyBagsText}>No bags added yet</Text>
            <Text style={styles.emptyBagsHint}>Tap "Add Bag" to add bags with weight</Text>
          </View>
        )}
        {bags.map((bag, index) => (
          <View key={index} style={styles.bagCard}>
            <View style={styles.bagHeader}>
              <Text style={styles.bagTitle}>{bag.identifier}</Text>
              <TouchableOpacity onPress={() => removeBag(index)}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>
            <View style={styles.bagRow}>
              <View style={styles.bagField}>
                <Text style={styles.bagFieldLabel}>Weight (lbs)</Text>
                <TextInput
                  style={styles.bagInput}
                  value={bag.weight > 0 ? bag.weight.toString() : ''}
                  onChangeText={(v) => updateBag(index, 'weight', parseFloat(v) || 0)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.bagField}>
                <Text style={styles.bagFieldLabel}>Color</Text>
                <TextInput
                  style={styles.bagInput}
                  value={bag.color}
                  onChangeText={(v) => updateBag(index, 'color', v)}
                  placeholder="Optional"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>
            <View style={styles.bagFieldFull}>
              <Text style={styles.bagFieldLabel}>Notes</Text>
              <TextInput
                style={styles.bagInput}
                value={bag.description}
                onChangeText={(v) => updateBag(index, 'description', v)}
                placeholder="Special instructions for this bag..."
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
        ))}
        <View style={styles.totalWeightRow}>
          <Text style={styles.totalWeightLabel}>Total Weight:</Text>
          <Text style={styles.totalWeightValue}>{getTotalWeight()} lbs</Text>
        </View>
      </View>

      {/* Same Day */}
      <View style={styles.section}>
        <View style={[styles.switchRow, isSameDay && styles.switchRowActive]}>
          <View style={styles.switchContent}>
            <Ionicons name="flash" size={24} color={isSameDay ? '#f59e0b' : '#64748b'} />
            <View style={styles.switchTextContainer}>
              <Text style={styles.switchLabel}>Same Day Service</Text>
              <Text style={styles.switchHint}>+${settings?.sameDayExtraCentsPerPound?.toFixed(2) || '0.33'}/lb (min ${settings?.sameDayMinimumCharge?.toFixed(2) || '5.00'})</Text>
            </View>
          </View>
          <Switch
            value={isSameDay}
            onValueChange={setIsSameDay}
            trackColor={{ false: '#e2e8f0', true: '#fcd34d' }}
            thumbColor={isSameDay ? '#f59e0b' : '#f4f4f5'}
          />
        </View>
      </View>

      {/* Pickup Date */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pickup Date & Time</Text>
        <View style={styles.pickupDateCard}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#2563eb" />
            <Text style={styles.dateButtonText}>
              {formatPickupDate(estimatedPickupDate)}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          </TouchableOpacity>
          <View style={styles.dateButtonsRow}>
            <TouchableOpacity
              style={styles.quickDateButton}
              onPress={() => {
                const date = new Date();
                date.setHours(17, 0, 0, 0);
                setEstimatedPickupDate(date);
              }}
            >
              <Text style={styles.quickDateButtonText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickDateButton}
              onPress={() => {
                const date = new Date();
                date.setDate(date.getDate() + 1);
                date.setHours(17, 0, 0, 0);
                setEstimatedPickupDate(date);
              }}
            >
              <Text style={styles.quickDateButtonText}>Tomorrow</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickDateButton}
              onPress={() => setShowTimePicker(true)}
            >
              <Ionicons name="time-outline" size={16} color="#2563eb" />
              <Text style={styles.quickDateButtonText}>Time</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.datePickerModalOverlay}>
          <View style={styles.datePickerModalContent}>
            <View style={styles.datePickerHeader}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.datePickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.datePickerTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.datePickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerSelectedDisplay}>
              <Text style={styles.datePickerSelectedText}>
                {`${estimatedPickupDate.toLocaleDateString('en-US', { weekday: 'short' })}, ${estimatedPickupDate.toLocaleDateString('en-US', { month: 'short' })} ${estimatedPickupDate.getDate()}, ${estimatedPickupDate.getFullYear()}`}
              </Text>
            </View>
            <DateTimePicker
              value={estimatedPickupDate}
              mode="date"
              display="spinner"
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  const newDate = new Date(estimatedPickupDate);
                  newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                  setEstimatedPickupDate(newDate);
                }
              }}
              style={styles.datePickerSpinner}
            />
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.datePickerModalOverlay}>
          <View style={styles.datePickerModalContent}>
            <View style={styles.datePickerHeader}>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.datePickerCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.datePickerTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.datePickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.datePickerSelectedDisplay}>
              <Text style={styles.datePickerSelectedText}>
                {estimatedPickupDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </Text>
            </View>
            <DateTimePicker
              value={estimatedPickupDate}
              mode="time"
              display="spinner"
              onChange={(event, selectedTime) => {
                if (selectedTime) {
                  const newDate = new Date(estimatedPickupDate);
                  newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
                  setEstimatedPickupDate(newDate);
                }
              }}
              style={styles.datePickerSpinner}
            />
          </View>
        </View>
      </Modal>

      {/* Extra Items */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Extra Items</Text>
          <TouchableOpacity
            style={styles.addExtraItemsButton}
            onPress={() => setShowExtraItemsModal(true)}
          >
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={styles.addExtraItemsButtonText}>Add Extra Items</Text>
          </TouchableOpacity>
        </View>
        {/* Show selected extra items summary */}
        {Object.keys(selectedExtras).filter(id => selectedExtras[id]?.quantity > 0).length > 0 ? (
          <View style={styles.selectedExtrasCard}>
            {Object.entries(selectedExtras)
              .filter(([_, data]) => data.quantity > 0)
              .map(([itemId, data]) => {
                const item = extraItems.find(e => e._id === itemId);
                if (!item) return null;
                const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                const totalWeight = getTotalWeight();
                const displayQty = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight) : data.quantity;
                return (
                  <View key={itemId} style={styles.selectedExtraRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedExtraName}>
                        {item.name} × {displayQty}
                      </Text>
                      {isWeightBased && (
                        <Text style={styles.selectedExtraHint}>
                          ({totalWeight} lbs @ ${data.price}/{item.perWeightUnit} lbs)
                        </Text>
                      )}
                    </View>
                    <Text style={styles.selectedExtraPrice}>${(data.price * displayQty).toFixed(2)}</Text>
                  </View>
                );
              })}
          </View>
        ) : (
          <View style={styles.noExtrasCard}>
            <Text style={styles.noExtrasText}>No extra items selected</Text>
            <Text style={styles.noExtrasHint}>Tap "Add Extra Items" to add items</Text>
          </View>
        )}
      </View>

      {/* Special Instructions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Special Instructions</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={specialInstructions}
          onChangeText={setSpecialInstructions}
          placeholder="Any special notes..."
          placeholderTextColor="#94a3b8"
          multiline={true}
          numberOfLines={3}
          scrollEnabled={false}
          blurOnSubmit={false}
          onFocus={() => {
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd(true);
            }, 300);
          }}
        />
      </View>

      {/* Payment */}
      <View style={styles.section}>
        <View style={[styles.switchRow, markAsPaid && styles.switchRowPaid]}>
          <View style={styles.switchContent}>
            <Ionicons name="card" size={24} color={markAsPaid ? '#10b981' : '#64748b'} />
            <View style={styles.switchTextContainer}>
              <Text style={styles.switchLabel}>Mark as Paid</Text>
              <Text style={styles.switchHint}>Payment received at creation</Text>
            </View>
          </View>
          <Switch
            value={markAsPaid}
            onValueChange={setMarkAsPaid}
            trackColor={{ false: '#e2e8f0', true: '#86efac' }}
            thumbColor={markAsPaid ? '#10b981' : '#f4f4f5'}
          />
        </View>
        {markAsPaid && (
          <View style={styles.paymentMethodContainer}>
            <Text style={styles.paymentMethodLabel}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              {PAYMENT_METHODS.map(method => (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    styles.paymentMethodButton,
                    paymentMethod === method.value && styles.paymentMethodButtonActive,
                  ]}
                  onPress={() => setPaymentMethod(method.value)}
                >
                  <Text style={[
                    styles.paymentMethodText,
                    paymentMethod === method.value && styles.paymentMethodTextActive,
                  ]}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Customer Credit */}
      {selectedCustomer && (selectedCustomer.credit || 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Credit</Text>
          <View style={styles.creditCard}>
            <View style={styles.creditHeader}>
              <View style={styles.creditInfo}>
                <Ionicons name="wallet" size={24} color="#10b981" />
                <View>
                  <Text style={styles.creditLabel}>Available Credit</Text>
                  <Text style={styles.creditAmount}>${(selectedCustomer.credit || 0).toFixed(2)}</Text>
                </View>
              </View>
              <Switch
                value={applyCredit}
                onValueChange={(value) => {
                  setApplyCredit(value);
                  if (value) {
                    const available = selectedCustomer.credit || 0;
                    const total = calculateTotal();
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
                {(selectedCustomer.credit || 0) > creditToApply && (
                  <Text style={styles.creditRemaining}>
                    Remaining after order: ${((selectedCustomer.credit || 0) - creditToApply).toFixed(2)}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Price Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Price Breakdown</Text>
        <View style={styles.breakdownCard}>
          {getPriceBreakdown().length > 0 ? (
            <>
              {getPriceBreakdown().map((item, index) => (
                <View key={index} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{item.label}</Text>
                  <Text style={styles.breakdownAmount}>${item.amount.toFixed(2)}</Text>
                </View>
              ))}
              {applyCredit && creditToApply > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: '#10b981' }]}>Credit Applied</Text>
                  <Text style={[styles.breakdownAmount, { color: '#10b981' }]}>-${creditToApply.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownTotal}>
                <Text style={styles.breakdownTotalLabel}>Total</Text>
                <Text style={styles.breakdownTotalAmount}>
                  ${Math.max(0, calculateTotal() - creditToApply).toFixed(2)}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.breakdownEmpty}>Add items to see price breakdown</Text>
          )}
        </View>
      </View>

      {/* Submit Button */}
      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Create Order</Text>
        )}
      </TouchableOpacity>

      {/* Extra Items Modal */}
      <Modal
        visible={showExtraItemsModal}
        animationType="slide"
        onRequestClose={() => setShowExtraItemsModal(false)}
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
                const totalWeight = getTotalWeight();
                const autoQuantity = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight) : 0;
                const data = selectedExtras[item._id] || { quantity: 0, price: item.price };
                const quantity = isWeightBased ? (data.quantity > 0 ? autoQuantity : 0) : data.quantity;
                const customPrice = data.price;
                const isEnabled = data.quantity > 0 || (selectedExtras[item._id] !== undefined);

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
                              setSelectedExtras(prev => ({
                                ...prev,
                                [item._id]: { quantity: autoQuantity, price: item.price }
                              }));
                            } else {
                              setSelectedExtras(prev => {
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
                            onPress={() => setSelectedExtras(prev => {
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
                            onPress={() => setSelectedExtras(prev => {
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
                                key={`${item._id}-${data.overrideTotal !== undefined ? 'override' : 'calc'}`}
                                style={[styles.modalPriceInput, data.overrideTotal !== undefined && styles.modalPriceInputOverride]}
                                defaultValue={data.overrideTotal !== undefined ? data.overrideTotal.toString() : roundToNearestQuarter(customPrice * quantity).toFixed(2)}
                                onChangeText={(text) => {
                                  // Clean input - only allow numbers and one decimal
                                  const cleaned = text.replace(/[^0-9.]/g, '');
                                  const parts = cleaned.split('.');
                                  const finalText = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;

                                  if (finalText === '' || finalText === '.') {
                                    setSelectedExtras(prev => ({
                                      ...prev,
                                      [item._id]: { ...prev[item._id], overrideTotal: 0 }
                                    }));
                                    return;
                                  }
                                  const newTotal = parseFloat(finalText);
                                  if (!isNaN(newTotal)) {
                                    setSelectedExtras(prev => ({
                                      ...prev,
                                      [item._id]: { ...prev[item._id], overrideTotal: newTotal }
                                    }));
                                  }
                                }}
                                keyboardType="decimal-pad"
                                selectTextOnFocus={true}
                                placeholder={roundToNearestQuarter(customPrice * quantity).toFixed(2)}
                                placeholderTextColor="#94a3b8"
                              />
                            </View>
                            {data.overrideTotal !== undefined && (
                              <TouchableOpacity
                                onPress={() => setSelectedExtras(prev => ({
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
                                  setSelectedExtras(prev => ({
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
          {Object.keys(selectedExtras).filter(id => selectedExtras[id]?.quantity > 0).length > 0 && (
            <View style={styles.modalSummary}>
              <Text style={styles.modalSummaryTitle}>Selected Items:</Text>
              {Object.entries(selectedExtras)
                .filter(([_, data]) => data.quantity > 0)
                .map(([itemId, data]) => {
                  const item = extraItems.find(i => i._id === itemId);
                  if (!item) return null;
                  const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                  const totalWeight = getTotalWeight();
                  const displayQty = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight) : data.quantity;
                  const itemTotal = isWeightBased && data.overrideTotal !== undefined
                    ? data.overrideTotal
                    : roundToNearestQuarter(data.price * displayQty);
                  return (
                    <View key={itemId} style={styles.modalSummaryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalSummaryText}>{item.name} × {displayQty}</Text>
                        {isWeightBased && (
                          <Text style={styles.modalSummaryCalc}>
                            ({totalWeight} lbs ÷ {item.perWeightUnit} lbs)
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.modalSummaryPrice, isWeightBased && data.overrideTotal !== undefined && { color: '#ef4444' }]}>
                        ${itemTotal.toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              <View style={styles.modalSummaryTotal}>
                <Text style={styles.modalSummaryTotalLabel}>Total:</Text>
                <Text style={styles.modalSummaryTotalValue}>
                  ${Object.entries(selectedExtras)
                    .reduce((sum, [itemId, data]) => {
                      const item = extraItems.find(i => i._id === itemId);
                      const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
                      const totalWeight = getTotalWeight();
                      const qty = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight) : data.quantity;
                      if (isWeightBased && data.overrideTotal !== undefined) {
                        return sum + data.overrideTotal;
                      }
                      return sum + roundToNearestQuarter(data.price * qty);
                    }, 0)
                    .toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setSelectedExtras({});
                setShowExtraItemsModal(false);
              }}
            >
              <Text style={styles.modalCancelButtonText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalDoneButton}
              onPress={() => setShowExtraItemsModal(false)}
            >
              <Text style={styles.modalDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Quick Add Customer Modal - Full Screen like Admin */}
      <Modal
        visible={showQuickAddCustomer}
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowQuickAddCustomer(false);
        }}
      >
        <View style={styles.quickAddContainer}>
          {/* Header */}
          <View style={styles.quickAddHeader}>
            <Text style={styles.quickAddHeaderTitle}>New Customer</Text>
            <TouchableOpacity onPress={() => {
              Keyboard.dismiss();
              setShowQuickAddCustomer(false);
            }}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView
            style={styles.quickAddScrollView}
            contentContainerStyle={styles.contentContainer}
            enableOnAndroid={true}
            extraScrollHeight={Platform.OS === 'ios' ? 120 : 80}
            extraHeight={120}
            keyboardShouldPersistTaps="handled"
            enableAutomaticScroll={true}
          >
            {/* Basic Information Section */}
            <View style={styles.quickAddSection}>
              <Text style={styles.quickAddSectionTitle}>Basic Information</Text>
              <View style={styles.quickAddCard}>
                <View style={styles.quickAddInputGroup}>
                  <Text style={styles.quickAddInputLabel}>Name *</Text>
                  <TextInput
                    style={styles.quickAddInput}
                    value={quickAddName}
                    onChangeText={setQuickAddName}
                    placeholder="Customer name"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.quickAddInputGroup}>
                  <Text style={styles.quickAddInputLabel}>Phone Number *</Text>
                  <TextInput
                    style={styles.quickAddInput}
                    value={quickAddPhone}
                    onChangeText={(text) => setQuickAddPhone(text.replace(/\D/g, ''))}
                    placeholder="(555) 123-4567"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                  {quickAddPhone.length > 0 && (
                    <Text style={styles.quickAddPhoneFormatted}>
                      {formatPhoneNumber(quickAddPhone)}
                    </Text>
                  )}
                </View>
                <View style={styles.quickAddInputGroup}>
                  <Text style={styles.quickAddInputLabel}>Email</Text>
                  <TextInput
                    style={styles.quickAddInput}
                    value={quickAddEmail}
                    onChangeText={setQuickAddEmail}
                    placeholder="Email address"
                    placeholderTextColor="#94a3b8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            {/* Delivery Information Section */}
            <View style={styles.quickAddSection}>
              <Text style={styles.quickAddSectionTitle}>Delivery Information</Text>
              <View style={styles.quickAddCard}>
                <View style={styles.quickAddInputGroup}>
                  <Text style={styles.quickAddInputLabel}>Address</Text>
                  <AddressInput
                    value={quickAddAddress}
                    onChange={setQuickAddAddress}
                    placeholder="Delivery address"
                    onFocusApartment={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd(true);
                      }, 100);
                    }}
                  />
                </View>
                <View style={styles.quickAddInputRow}>
                  <View style={[styles.quickAddInputGroup, { flex: 1 }]}>
                    <Text style={styles.quickAddInputLabel}>Delivery Fee ($)</Text>
                    <TextInput
                      style={styles.quickAddInput}
                      value={quickAddDeliveryFee}
                      onChangeText={setQuickAddDeliveryFee}
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.quickAddInputGroup, { flex: 1 }]}>
                    <Text style={styles.quickAddInputLabel}>Buzzer Code</Text>
                    <TextInput
                      style={styles.quickAddInput}
                      value={quickAddBuzzerCode}
                      onChangeText={setQuickAddBuzzerCode}
                      placeholder="Buzzer code"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Notes Section */}
            <View style={styles.quickAddSection}>
              <Text style={styles.quickAddSectionTitle}>Notes</Text>
              <TextInput
                style={[styles.quickAddInput, styles.quickAddTextArea, { backgroundColor: '#fff' }]}
                value={quickAddNotes}
                onChangeText={setQuickAddNotes}
                placeholder="Any notes about this customer..."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Actions */}
            <View style={styles.quickAddActionsSection}>
              <View style={styles.quickAddMainActions}>
                <TouchableOpacity
                  style={styles.quickAddCancelButton}
                  onPress={() => setShowQuickAddCustomer(false)}
                  disabled={quickAddCreating}
                >
                  <Text style={styles.quickAddCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickAddSaveButton, quickAddCreating && styles.quickAddButtonDisabled]}
                  onPress={handleQuickAddCustomer}
                  disabled={quickAddCreating}
                >
                  {quickAddCreating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                      <Text style={styles.quickAddSaveButtonText}>Create Customer</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  section: {
    marginBottom: 20,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionTitleInline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
  },
  customerList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  customerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  customerItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  customerItemPhone: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  selectedCustomer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  selectedCustomerInfo: {
    flex: 1,
    marginRight: 12,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  customerPhone: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  customerAddress: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  customerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editCustomerButton: {
    backgroundColor: '#eff6ff',
    padding: 8,
    borderRadius: 8,
  },
  deliveryInfoSection: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  deliveryInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 12,
  },
  deliveryInputGroup: {
    marginBottom: 12,
  },
  deliveryInputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#78350f',
    marginBottom: 6,
  },
  deliveryAddressInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1e293b',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  deliveryFeeInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1e293b',
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  typeButtonActive: {
    backgroundColor: '#2563eb',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748b',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  switchHint: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  extraItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  extraItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  extraItemPrice: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    minWidth: 24,
    textAlign: 'center',
  },
  totalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    color: '#94a3b8',
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#6ee7b7',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  // Section header with button
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  addBagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 0,
  },
  addBagText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  // Empty bags placeholder
  emptyBagsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyBagsText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyBagsHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  // Bag card styles
  bagCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
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
  bagRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  bagField: {
    flex: 1,
  },
  bagFieldFull: {
    width: '100%',
  },
  bagFieldLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  bagInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  totalWeightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  totalWeightLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  totalWeightValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  // Switch row improvements
  switchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  switchTextContainer: {
    flex: 1,
  },
  switchRowActive: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  switchRowPaid: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  // Payment method styles
  paymentMethodContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  paymentMethodLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 10,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentMethodButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentMethodButtonActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  paymentMethodTextActive: {
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
  creditRemaining: {
    fontSize: 13,
    color: '#065f46',
    marginTop: 4,
  },
  // Price breakdown styles
  breakdownCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#475569',
    flex: 1,
    paddingRight: 8,
  },
  breakdownAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  breakdownTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  breakdownTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  breakdownTotalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10b981',
  },
  breakdownEmpty: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
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
  modalItemCardSelected: {
    borderWidth: 2,
    borderColor: '#8b5cf6',
    backgroundColor: '#faf5ff',
  },
  modalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  modalItemBasePrice: {
    fontSize: 14,
    color: '#64748b',
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
  modalPriceEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9d5ff',
  },
  modalPriceLabel: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 8,
  },
  modalPriceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  modalPriceDollar: {
    fontSize: 16,
    color: '#64748b',
  },
  modalPriceInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 60,
  },
  modalPriceInputOverride: {
    color: '#ef4444',
  },
  modalClearOverride: {
    marginLeft: 8,
    padding: 4,
  },
  modalItemTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8b5cf6',
    marginLeft: 12,
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
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  modalCancelButtonText: {
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
  // Pickup date styles
  pickupDateCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  dateButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  quickDateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  quickDateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563eb',
  },
  // Date picker modal styles
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
  // Quick Add Customer styles - Full screen like CreateCustomerScreen
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  quickAddButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
  },
  quickAddContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  quickAddScrollView: {
    flex: 1,
  },
  quickAddHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 20,
    paddingTop: 60,
  },
  quickAddHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  quickAddSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  quickAddSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  quickAddCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  quickAddInputGroup: {
    marginBottom: 12,
  },
  quickAddInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  quickAddInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 6,
  },
  quickAddInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  quickAddTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  quickAddPhoneFormatted: {
    fontSize: 13,
    color: '#2563eb',
    marginTop: 4,
  },
  quickAddActionsSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  quickAddMainActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickAddCancelButton: {
    flex: 1,
    padding: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    alignItems: 'center',
  },
  quickAddCancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  quickAddSaveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 12,
  },
  quickAddSaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  quickAddButtonDisabled: {
    opacity: 0.6,
  },
});
