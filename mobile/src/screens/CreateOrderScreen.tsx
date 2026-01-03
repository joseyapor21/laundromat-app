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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import type { Customer, Settings, ExtraItem } from '../types';

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
  const [orderType, setOrderType] = useState<'in-store' | 'delivery'>('in-store');
  const [weight, setWeight] = useState('');
  const [isSameDay, setIsSameDay] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<Record<string, number>>({});

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

  function calculateTotal() {
    if (!settings) return 0;
    const w = parseFloat(weight) || 0;
    const effectiveWeight = Math.max(w, settings.minimumWeight);

    let pricePerPound = settings.pricePerPound;
    if (isSameDay) {
      pricePerPound = pricePerPound * (1 + (settings.sameDayExtraPercentage || 50) / 100);
    }

    let subtotal = effectiveWeight * pricePerPound;
    subtotal = Math.max(subtotal, settings.minimumPrice);

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

    // Same day fee
    let sameDayFee = 0;
    if (isSameDay && settings.sameDayMinimumCharge) {
      const calculatedFee = subtotal - (effectiveWeight * settings.pricePerPound);
      sameDayFee = Math.max(calculatedFee, settings.sameDayMinimumCharge);
    }

    return subtotal + extrasTotal + deliveryFee;
  }

  async function handleSubmit() {
    if (!selectedCustomer) {
      Alert.alert('Error', 'Please select a customer');
      return;
    }

    setSubmitting(true);
    try {
      const orderData = {
        customerId: selectedCustomer._id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phoneNumber,
        orderType,
        weight: parseFloat(weight) || 0,
        isSameDay,
        specialInstructions,
        items: [{
          serviceName: isSameDay ? 'Same Day Wash & Fold' : 'Wash & Fold',
          quantity: 1,
          pricePerUnit: settings?.pricePerPound || 1.25,
          weight: parseFloat(weight) || 0,
          total: calculateTotal(),
        }],
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
        paymentMethod: 'pending',
        paymentStatus: 'pending',
        status: orderType === 'delivery' ? 'scheduled_pickup' : 'new_order',
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
    <ScrollView style={styles.container}>
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
            style={[styles.typeButton, orderType === 'in-store' && styles.typeButtonActive]}
            onPress={() => setOrderType('in-store')}
          >
            <Ionicons
              name="storefront"
              size={24}
              color={orderType === 'in-store' ? '#fff' : '#64748b'}
            />
            <Text style={[styles.typeButtonText, orderType === 'in-store' && styles.typeButtonTextActive]}>
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

      {/* Weight */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weight (lbs)</Text>
        <TextInput
          style={styles.input}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          placeholder="Enter weight..."
          placeholderTextColor="#94a3b8"
        />
      </View>

      {/* Same Day */}
      <View style={styles.section}>
        <View style={styles.switchRow}>
          <View>
            <Text style={styles.switchLabel}>Same Day Service</Text>
            <Text style={styles.switchHint}>+{settings?.sameDayExtraPercentage || 50}% extra</Text>
          </View>
          <Switch
            value={isSameDay}
            onValueChange={setIsSameDay}
            trackColor={{ false: '#e2e8f0', true: '#bfdbfe' }}
            thumbColor={isSameDay ? '#2563eb' : '#f4f4f5'}
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
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <Text style={styles.totalLabel}>Estimated Total</Text>
        <Text style={styles.totalAmount}>${calculateTotal().toFixed(2)}</Text>
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

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
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
});
