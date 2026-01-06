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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import type { Customer, Settings, ExtraItem, OrderStatus, PaymentMethod, PaymentStatus } from '../types';

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
  const [bags, setBags] = useState<Bag[]>([{ identifier: 'Bag 1', weight: 0, color: '', description: '' }]);
  const [isSameDay, setIsSameDay] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<Record<string, number>>({});
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

  function calculateTotal() {
    if (!settings) return 0;

    const totalWeight = getTotalWeight();

    // Calculate laundry subtotal only if there's weight
    let laundrySubtotal = 0;
    if (totalWeight > 0) {
      const effectiveWeight = Math.max(totalWeight, settings.minimumWeight);
      let pricePerPound = settings.pricePerPound;

      if (isSameDay) {
        pricePerPound = pricePerPound * (1 + (settings.sameDayExtraPercentage || 50) / 100);
      }

      laundrySubtotal = effectiveWeight * pricePerPound;
      laundrySubtotal = Math.max(laundrySubtotal, settings.minimumPrice);
    }

    // Add extras
    let extrasTotal = 0;
    Object.entries(selectedExtras).forEach(([itemId, qty]) => {
      const item = extraItems.find(e => e._id === itemId);
      if (item && qty > 0) {
        extrasTotal += item.price * qty;
      }
    });

    // Add delivery fee
    let deliveryFee = 0;
    if (orderType === 'delivery' && selectedCustomer) {
      deliveryFee = parseFloat(selectedCustomer.deliveryFee.replace('$', '')) || 0;
    }

    return laundrySubtotal + extrasTotal + deliveryFee;
  }

  function getPriceBreakdown() {
    if (!settings) return [];

    const breakdown: { label: string; amount: number }[] = [];
    const totalWeight = getTotalWeight();

    // Laundry service
    if (totalWeight > 0) {
      const effectiveWeight = Math.max(totalWeight, settings.minimumWeight);
      let pricePerPound = settings.pricePerPound;
      const baseLabel = `${effectiveWeight} lbs × $${pricePerPound.toFixed(2)}/lb`;

      if (isSameDay) {
        pricePerPound = pricePerPound * (1 + (settings.sameDayExtraPercentage || 50) / 100);
        breakdown.push({
          label: `Same Day: ${effectiveWeight} lbs × $${pricePerPound.toFixed(2)}/lb`,
          amount: Math.max(effectiveWeight * pricePerPound, settings.minimumPrice),
        });
      } else {
        breakdown.push({
          label: baseLabel,
          amount: Math.max(effectiveWeight * pricePerPound, settings.minimumPrice),
        });
      }

      if (totalWeight < settings.minimumWeight) {
        breakdown[0].label += ` (min ${settings.minimumWeight} lbs)`;
      }
    }

    // Extra items
    Object.entries(selectedExtras).forEach(([itemId, qty]) => {
      const item = extraItems.find(e => e._id === itemId);
      if (item && qty > 0) {
        breakdown.push({
          label: `${item.name} × ${qty}`,
          amount: item.price * qty,
        });
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
    if (bags.length > 1) {
      const newBags = bags.filter((_, i) => i !== index);
      // Re-number bags
      setBags(newBags.map((bag, i) => ({ ...bag, identifier: `Bag ${i + 1}` })));
    }
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
    const hasExtras = Object.values(selectedExtras).some(qty => qty > 0);

    // Require either weight or extras
    if (totalWeight === 0 && !hasExtras) {
      Alert.alert('Error', 'Please add bag weights or extra items');
      return;
    }

    setSubmitting(true);
    try {
      const orderData = {
        customerId: selectedCustomer._id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phoneNumber,
        orderType,
        weight: totalWeight,
        bags: bags.map(bag => ({
          identifier: bag.identifier,
          weight: bag.weight,
          color: bag.color,
          description: bag.description,
        })),
        isSameDay,
        specialInstructions,
        items: totalWeight > 0 ? [{
          serviceName: isSameDay ? 'Same Day Wash & Fold' : 'Wash & Fold',
          quantity: 1,
          pricePerUnit: settings?.pricePerPound || 1.25,
          weight: totalWeight,
          total: calculateTotal(),
        }] : [],
        extraItems: Object.entries(selectedExtras)
          .filter(([, qty]) => qty > 0)
          .map(([itemId, qty]) => {
            const item = extraItems.find(e => e._id === itemId)!;
            return {
              itemId,
              name: item.name,
              price: item.price,
              quantity: qty,
            };
          }),
        totalAmount: calculateTotal(),
        deliveryFee: orderType === 'delivery'
          ? parseFloat(selectedCustomer.deliveryFee.replace('$', '')) || 0
          : 0,
        isPaid: markAsPaid,
        paymentMethod: markAsPaid ? paymentMethod : 'pending' as PaymentMethod,
        paymentStatus: markAsPaid ? 'paid' as PaymentStatus : 'pending' as PaymentStatus,
        status: (orderType === 'delivery' ? 'scheduled_pickup' : 'received') as OrderStatus,
      };

      await api.createOrder(orderData);
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
        {bags.map((bag, index) => (
          <View key={index} style={styles.bagCard}>
            <View style={styles.bagHeader}>
              <Text style={styles.bagTitle}>{bag.identifier}</Text>
              {bags.length > 1 && (
                <TouchableOpacity onPress={() => removeBag(index)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
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
              <Text style={styles.switchHint}>+{settings?.sameDayExtraPercentage || 50}% extra charge</Text>
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
      {extraItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Extra Items</Text>
          {extraItems.map(item => (
            <View key={item._id} style={styles.extraItem}>
              <View>
                <Text style={styles.extraItemName}>{item.name}</Text>
                <Text style={styles.extraItemPrice}>${item.price.toFixed(2)}</Text>
              </View>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => setSelectedExtras(prev => ({
                    ...prev,
                    [item._id]: Math.max(0, (prev[item._id] || 0) - 1)
                  }))}
                >
                  <Ionicons name="remove" size={20} color="#64748b" />
                </TouchableOpacity>
                <Text style={styles.quantityText}>{selectedExtras[item._id] || 0}</Text>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => setSelectedExtras(prev => ({
                    ...prev,
                    [item._id]: (prev[item._id] || 0) + 1
                  }))}
                >
                  <Ionicons name="add" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

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
});
