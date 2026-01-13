import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { generateCustomerReceiptText, generateStoreCopyText } from '../services/receiptGenerator';
import type { Customer, Settings, ExtraItem, PaymentMethod } from '../types';

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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [orderType, setOrderType] = useState<'storePickup' | 'delivery'>('storePickup');
  const [bags, setBags] = useState<Bag[]>([]);
  const [isSameDay, setIsSameDay] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<Record<string, { quantity: number; price: number }>>({});
  const [showExtraItemsModal, setShowExtraItemsModal] = useState(false);
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  useEffect(() => {
    loadData();
  }, []);

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
          // Proportional pricing: (weight / perWeightUnit) * price, rounded to nearest quarter
          const proportionalQty = calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight);
          const itemTotal = roundToNearestQuarter(data.price * proportionalQty);
          extrasTotal += itemTotal;
        } else {
          extrasTotal += data.price * data.quantity;
        }
      }
    });

    // Add delivery fee
    let deliveryFee = 0;
    if (orderType === 'delivery' && selectedCustomer) {
      deliveryFee = parseFloat(selectedCustomer.deliveryFee.replace('$', '')) || 0;
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
          const proportionalQty = calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight);
          const itemTotal = roundToNearestQuarter(data.price * proportionalQty);
          breakdown.push({
            label: `${item.name} (${totalWeight}lbs @ $${data.price}/${item.perWeightUnit}lbs)`,
            amount: itemTotal,
          });
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
      const fee = parseFloat(selectedCustomer.deliveryFee.replace('$', '')) || 0;
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

    const totalWeight = getTotalWeight();

    setSubmitting(true);
    try {
      // Calculate estimated pickup date (tomorrow by default)
      const estimatedPickup = new Date();
      estimatedPickup.setDate(estimatedPickup.getDate() + 1);

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
          };
        });

      const orderData = {
        customerId: selectedCustomer._id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phoneNumber,
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
        dropOffDate: new Date().toISOString(),
        estimatedPickupDate: estimatedPickup.toISOString(),
        isPaid: markAsPaid,
        paymentMethod: markAsPaid ? paymentMethod : 'pending',
      };

      const createdOrder = await api.createOrder(orderData);

      // Auto-print receipts for in-store pickup (drop-off) orders
      if (orderType === 'storePickup') {
        try {
          // Print customer receipt
          const customerReceipt = generateCustomerReceiptText(createdOrder);
          await api.printReceipt(customerReceipt);
          // Print store copy
          const storeCopy = generateStoreCopyText(createdOrder);
          await api.printReceipt(storeCopy);
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* Customer Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Customer</Text>
        {selectedCustomer ? (
          <View style={styles.selectedCustomer}>
            <View>
              <Text style={styles.customerName}>{selectedCustomer.name}</Text>
              <Text style={styles.customerPhone}>{selectedCustomer.phoneNumber}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCustomer(null)}>
              <Ionicons name="close-circle" size={24} color="#ef4444" />
            </TouchableOpacity>
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
                    onPress={() => {
                      Keyboard.dismiss();
                      setSelectedCustomer(customer);
                      setCustomerSearch('');
                    }}
                  >
                    <Text style={styles.customerItemName}>{customer.name}</Text>
                    <Text style={styles.customerItemPhone}>{customer.phoneNumber}</Text>
                  </TouchableOpacity>
                ))}
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
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownTotal}>
                <Text style={styles.breakdownTotalLabel}>Total</Text>
                <Text style={styles.breakdownTotalAmount}>${calculateTotal().toFixed(2)}</Text>
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
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Extra Items</Text>
            <TouchableOpacity onPress={() => setShowExtraItemsModal(false)}>
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
                        <Text style={styles.modalPriceLabel}>
                          {isWeightBased ? `Price per ${item.perWeightUnit} lbs:` : 'Price per item:'}
                        </Text>
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
                      <Text style={styles.modalSummaryPrice}>${(data.price * displayQty).toFixed(2)}</Text>
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
                      return sum + data.price * qty;
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
    </ScrollView>
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
    alignItems: 'center',
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
});
