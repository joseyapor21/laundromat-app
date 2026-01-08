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
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { Order, ExtraItem, Settings, Bag, OrderType, OrderExtraItem } from '../types';

export default function EditOrderScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
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
  const [selectedExtraItems, setSelectedExtraItems] = useState<Record<string, { quantity: number; price: number }>>({});
  const [showExtraItemsModal, setShowExtraItemsModal] = useState(false);

  // Pricing
  const [settings, setSettings] = useState<Settings | null>(null);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [priceChangeNote, setPriceChangeNote] = useState('');
  const [showPriceOverride, setShowPriceOverride] = useState(false);

  // Delivery
  const [deliveryPrice, setDeliveryPrice] = useState(0);

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
      setCustomerPhone(orderData.customerPhone || '');
      setCustomerAddress(orderData.customer?.address || '');
      setSpecialInstructions(orderData.specialInstructions || '');
      setOrderType(orderData.orderType || 'storePickup');
      setIsSameDay(orderData.isSameDay || false);
      setBags(orderData.bags || []);

      // Delivery price from customer
      if (orderData.customer?.deliveryFee) {
        const fee = parseFloat(orderData.customer.deliveryFee.replace('$', '')) || 0;
        setDeliveryPrice(fee);
      }

      // Populate extra items
      if (orderData.extraItems) {
        const extraItemsMap: Record<string, { quantity: number; price: number }> = {};
        orderData.extraItems.forEach((item: any) => {
          const itemId = item.item?._id || item.itemId;
          if (itemId) {
            extraItemsMap[itemId] = {
              quantity: item.quantity,
              price: item.price || item.item?.price || 0
            };
          }
        });
        setSelectedExtraItems(extraItemsMap);
      }

      // Price override
      if ((orderData as any).priceOverride) {
        setPriceOverride((orderData as any).priceOverride);
        setShowPriceOverride(true);
        setPriceChangeNote((orderData as any).priceChangeNote || '');
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

  // Calculate quantity for weight-based items (e.g., "per 15 lbs")
  const calculateWeightBasedQuantity = (perWeightUnit: number, totalWeight: number): number => {
    if (perWeightUnit <= 0 || totalWeight <= 0) return 0;
    return Math.ceil(totalWeight / perWeightUnit);
  };

  // Update weight-based extra items when weight changes
  useEffect(() => {
    const totalWeight = calculateTotalWeight();
    setSelectedExtraItems(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      Object.keys(updated).forEach(itemId => {
        const item = extraItems.find(e => e._id === itemId);
        if (item?.perWeightUnit && item.perWeightUnit > 0) {
          const newQty = calculateWeightBasedQuantity(item.perWeightUnit, totalWeight);
          if (updated[itemId].quantity !== newQty && updated[itemId].quantity > 0) {
            updated[itemId] = { ...updated[itemId], quantity: newQty };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [bags, extraItems, calculateTotalWeight]);

  // Round to nearest quarter
  const roundToQuarter = (value: number): number => {
    return Math.round(value * 4) / 4;
  };

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
      const item = extraItems.find(e => e._id === itemId);
      const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
      const qty = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, weight) : data.quantity;
      return total + (data.price * qty);
    }, 0);

    let deliveryFee = 0;
    if (orderType === 'delivery' && deliveryPrice > 0) {
      deliveryFee = deliveryPrice;
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
          const qty = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight) : data.quantity;
          return {
            item: item!,
            quantity: qty,
            price: data.price
          };
        });

      const updates: any = {
        customerName,
        customerPhone,
        weight: calculateTotalWeight(),
        specialInstructions,
        totalAmount: getFinalPrice(),
        priceOverride: priceOverride || undefined,
        priceChangeNote: priceChangeNote || undefined,
        extraItems: orderExtraItems,
        bags,
        orderType,
        isSameDay,
        sameDayPricePerPound: isSameDay ? getSameDayPricePerPound() : undefined,
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
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
                  onChangeText={setCustomerPhone}
                  placeholder="Phone number"
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
                        value={bag.weight?.toString() || ''}
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
                <Text style={styles.addExtraItemsButtonText}>Add Extra Items</Text>
              </TouchableOpacity>
            </View>
            {/* Show selected extra items summary */}
            {Object.keys(selectedExtraItems).filter(id => selectedExtraItems[id]?.quantity > 0).length > 0 ? (
              <View style={styles.selectedExtrasCard}>
                {Object.entries(selectedExtraItems)
                  .filter(([_, data]) => data.quantity > 0)
                  .map(([itemId, data]) => {
                    const item = extraItems.find(e => e._id === itemId);
                    if (!item) return null;
                    const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                    const totalWeight = calculateTotalWeight();
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
              style={[styles.input, styles.textArea, { backgroundColor: '#fff' }]}
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              placeholder="Any special instructions..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </View>

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
                        +${Object.entries(selectedExtraItems).reduce((total, [_, data]) => {
                          return total + (data.price * data.quantity);
                        }, 0).toFixed(2)}
                      </Text>
                    </View>
                  )}
                  {orderType === 'delivery' && deliveryPrice > 0 && (
                    <View style={styles.priceRow}>
                      <Text style={styles.priceLabel}>Delivery Fee</Text>
                      <Text style={styles.priceValue}>+${deliveryPrice.toFixed(2)}</Text>
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

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

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
                const totalWeight = calculateTotalWeight();
                const autoQuantity = isWeightBased ? calculateWeightBasedQuantity(item.perWeightUnit!, totalWeight) : 0;
                const data = selectedExtraItems[item._id] || { quantity: 0, price: item.price };
                const quantity = isWeightBased ? (data.quantity > 0 ? autoQuantity : 0) : data.quantity;
                const customPrice = data.price;
                const isEnabled = data.quantity > 0 || (selectedExtraItems[item._id] !== undefined);

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
                  ${Object.entries(selectedExtraItems)
                    .reduce((sum, [itemId, data]) => {
                      const item = extraItems.find(i => i._id === itemId);
                      const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
                      const totalWeight = calculateTotalWeight();
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
              style={styles.modalClearButton}
              onPress={() => {
                setSelectedExtraItems({});
              }}
            >
              <Text style={styles.modalClearButtonText}>Clear All</Text>
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
  scrollView: {
    flex: 1,
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
  modalItemTotal: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#10b981',
  },
});
