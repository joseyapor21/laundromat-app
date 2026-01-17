'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Customer, ExtraItem, Settings, Bag, OrderType, PaymentMethod } from '@/types';
import { printerService } from '@/services/printerService';
import AddressInput from '@/components/AddressInput';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
];
import toast from 'react-hot-toast';

interface CreateOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface NewCustomer {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  address: string;
  deliveryPrice: number;
}

export default function CreateOrderModal({ onClose, onSuccess }: CreateOrderModalProps) {
  const [orderType, setOrderType] = useState<OrderType>('storePickup');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<NewCustomer>({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    address: '',
    deliveryPrice: 0,
  });
  const [weight, setWeight] = useState<number>(0);
  const [bags, setBags] = useState<Bag[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [selectedExtraItems, setSelectedExtraItems] = useState<Record<string, { quantity: number; price: number }>>({}); // Stores quantity and custom price
  const [showExtraItems, setShowExtraItems] = useState(false);
  const [scheduledPickupTime, setScheduledPickupTime] = useState('');
  const [dropOffDate, setDropOffDate] = useState('');
  const [inStorePickupDate, setInStorePickupDate] = useState('');
  const [notes, setNotes] = useState('');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [totalPrice, setTotalPrice] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [applyCredit, setApplyCredit] = useState(false);
  const [creditToApply, setCreditToApply] = useState(0);
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isSameDay, setIsSameDay] = useState(false);

  // Search customers
  const searchCustomers = useCallback(async () => {
    if (!customerSearch || customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/customers/search?q=${encodeURIComponent(customerSearch)}`);
      if (response.ok) {
        const results = await response.json();
        setCustomerResults(results);
      }
    } catch (error) {
      console.error('Failed to search customers:', error);
    } finally {
      setIsSearching(false);
    }
  }, [customerSearch]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchCustomers();
    }, 300);
    return () => clearTimeout(debounce);
  }, [customerSearch, searchCustomers]);

  // Auto-calculate drop-off date (2 days after pickup)
  useEffect(() => {
    if (scheduledPickupTime && orderType === 'delivery') {
      const pickupDate = new Date(scheduledPickupTime);
      const dropOffCalculated = new Date(pickupDate);
      dropOffCalculated.setDate(dropOffCalculated.getDate() + 2);
      setDropOffDate(dropOffCalculated.toISOString().split('T')[0]);
    }
  }, [scheduledPickupTime, orderType]);

  const loadInitialData = async () => {
    try {
      const [settingsRes, extraItemsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/extra-items'),
      ]);

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData);
      }

      if (extraItemsRes.ok) {
        const extraItemsData = await extraItemsRes.json();
        setExtraItems(extraItemsData.filter((item: ExtraItem) => item.isActive));
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
      toast.error('Failed to load initial data');
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setCustomerResults([]);

    const deliveryFee = customer.deliveryFee
      ? parseFloat(customer.deliveryFee.replace('$', ''))
      : 0;

    setNewCustomer({
      firstName: customer.name.split(' ')[0] || '',
      lastName: customer.name.split(' ').slice(1).join(' ') || '',
      phoneNumber: customer.phoneNumber || '',
      address: customer.address || '',
      deliveryPrice: deliveryFee,
    });
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setNewCustomer({
      firstName: '',
      lastName: '',
      phoneNumber: '',
      address: '',
      deliveryPrice: 0,
    });
    setApplyCredit(false);
    setCreditToApply(0);
  };

  // Helper function to round to nearest quarter (0.25)
  const roundToQuarter = (value: number): number => {
    return Math.round(value * 4) / 4;
  };

  // Calculate order price (laundry only, no delivery fee)
  // Pricing: minimum price for first X pounds, then price per pound for extra
  const calculateLaundryPrice = useCallback((weight: number, settings: Settings): number => {
    if (!settings || weight <= 0) return 0;

    const minWeight = settings.minimumWeight || 8;
    const pricePerPound = settings.pricePerPound || 1.25;
    const minPrice = settings.minimumPrice || 8;

    // If at or below minimum weight, charge minimum price
    if (weight <= minWeight) {
      return minPrice;
    }

    // Over minimum weight - charge minimum + extra pounds at price per pound (rounded to nearest quarter)
    const extraPounds = weight - minWeight;
    return roundToQuarter(minPrice + (extraPounds * pricePerPound));
  }, []);

  // Calculate same day price per pound (regular + extra)
  const getSameDayPricePerPound = useCallback((): number => {
    if (!settings) return 0;
    const regularPrice = settings.pricePerPound || 1.25;
    const extraCentsPerPound = settings.sameDayExtraCentsPerPound || 0.33;
    return regularPrice + extraCentsPerPound;
  }, [settings]);

  // Calculate same day extra charge (rounded to nearest quarter)
  const getSameDayExtraCharge = useCallback((): number => {
    if (!settings || !isSameDay || weight <= 0) return 0;

    const extraCentsPerPound = settings.sameDayExtraCentsPerPound || 0.33;
    const calculatedExtra = weight * extraCentsPerPound;

    // Use minimum charge if calculated is less, then round to nearest quarter
    const minimumCharge = settings.sameDayMinimumCharge || 5;
    return roundToQuarter(Math.max(calculatedExtra, minimumCharge));
  }, [settings, isSameDay, weight]);

  const calculateTotalPrice = useCallback(() => {
    if (!settings) return 0;

    // Calculate laundry price (no delivery fee included)
    let basePrice = calculateLaundryPrice(weight, settings);

    // Add same day extra charge
    const sameDayExtra = getSameDayExtraCharge();
    basePrice += sameDayExtra;

    // Add delivery fee ONLY for delivery orders
    const isDelivery = orderType === 'delivery';
    if (isDelivery) {
      const customerDeliveryFee = newCustomer.deliveryPrice || 0;
      basePrice += customerDeliveryFee;
    }

    // Add extra items (handle weight-based items - calculate exact proportional amount, round to nearest quarter)
    const extraItemsTotal = Object.entries(selectedExtraItems).reduce((total, [itemId, data]) => {
      if (data.quantity > 0) {
        const item = extraItems.find(i => i._id === itemId);
        const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
        // For weight-based: calculate exact proportional cost (weight / perWeightUnit * price), then round
        const itemTotal = isWeightBased
          ? roundToQuarter((weight / item.perWeightUnit!) * data.price)
          : data.price * data.quantity;
        return total + itemTotal;
      }
      return total;
    }, 0);

    return basePrice + extraItemsTotal;
  }, [settings, weight, orderType, selectedExtraItems, extraItems, calculateLaundryPrice, newCustomer.deliveryPrice, getSameDayExtraCharge]);

  // Get price breakdown for display
  const getPriceBreakdown = useCallback(() => {
    if (!settings) return [];

    const breakdown: { label: string; amount: number }[] = [];

    // Laundry price - tiered pricing
    if (weight > 0) {
      const minWeight = settings.minimumWeight || 8;
      const pricePerPound = settings.pricePerPound || 1.25;
      const minPrice = settings.minimumPrice || 8;

      if (weight <= minWeight) {
        // Under or at minimum weight - show base price
        breakdown.push({
          label: `Base (up to ${minWeight} lbs)`,
          amount: minPrice,
        });
      } else {
        // Over minimum weight - show base + extra (rounded to nearest quarter)
        const extraPounds = weight - minWeight;
        breakdown.push({
          label: `Base (first ${minWeight} lbs)`,
          amount: minPrice,
        });
        breakdown.push({
          label: `Extra ${extraPounds} lbs × $${pricePerPound.toFixed(2)}/lb`,
          amount: roundToQuarter(extraPounds * pricePerPound),
        });
      }
    }

    // Same day extra charge
    if (isSameDay && weight > 0) {
      const sameDayExtra = getSameDayExtraCharge();
      const minimumCharge = settings.sameDayMinimumCharge || 5;
      if (sameDayExtra === minimumCharge) {
        breakdown.push({
          label: `Same Day (min $${minimumCharge.toFixed(2)})`,
          amount: sameDayExtra,
        });
      } else {
        breakdown.push({
          label: `Same Day: ${weight} lbs × $${(settings.sameDayExtraCentsPerPound || 0.33).toFixed(2)}/lb`,
          amount: sameDayExtra,
        });
      }
    }

    // Delivery fee
    if (orderType === 'delivery' && newCustomer.deliveryPrice > 0) {
      breakdown.push({
        label: 'Delivery Fee',
        amount: newCustomer.deliveryPrice,
      });
    }

    // Extra items (handle weight-based items - calculate exact proportional amount, round to nearest quarter)
    Object.entries(selectedExtraItems).forEach(([itemId, data]) => {
      const item = extraItems.find(i => i._id === itemId);
      if (item && data.quantity > 0) {
        const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
        // For weight-based: calculate exact proportional cost
        const itemTotal = isWeightBased
          ? roundToQuarter((weight / item.perWeightUnit!) * data.price)
          : data.price * data.quantity;
        breakdown.push({
          label: isWeightBased
            ? `${item.name} (${weight}lbs @ $${data.price}/${item.perWeightUnit}lbs)`
            : `${item.name} × ${data.quantity}`,
          amount: itemTotal,
        });
      }
    });

    return breakdown;
  }, [settings, weight, orderType, newCustomer.deliveryPrice, selectedExtraItems, extraItems, calculateLaundryPrice, isSameDay, getSameDayExtraCharge]);

  // Calculate total weight from all bags
  const calculateTotalWeight = useCallback(() => {
    return bags.reduce((total, bag) => total + bag.weight, 0);
  }, [bags]);

  // Calculate quantity for weight-based items (e.g., "per 15 lbs")
  // Returns exact proportional quantity for pricing calculations
  const calculateWeightBasedQuantity = useCallback((perWeightUnit: number, totalWeight: number): number => {
    if (perWeightUnit <= 0 || totalWeight <= 0) return 0;
    return totalWeight / perWeightUnit;
  }, []);

  // Update the main weight when bags change
  useEffect(() => {
    const totalWeight = calculateTotalWeight();
    setWeight(totalWeight);
  }, [bags, calculateTotalWeight]);

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
          if (updated[itemId].quantity !== newQty) {
            updated[itemId] = { ...updated[itemId], quantity: newQty };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [bags, extraItems, calculateTotalWeight, calculateWeightBasedQuantity]);

  // Update total price when dependencies change
  useEffect(() => {
    const newPrice = calculateTotalPrice();
    setTotalPrice(newPrice);
  }, [calculateTotalPrice]);

  const addBag = () => {
    const newBag: Bag = {
      identifier: `Bag ${bags.length + 1}`,
      weight: 0,
      color: '',
      description: ''
    };
    setBags(prev => [...prev, newBag]);
  };

  const updateBag = (index: number, field: keyof Bag, value: string | number) => {
    setBags(prev => prev.map((bag, i) =>
      i === index ? { ...bag, [field]: value } : bag
    ));
  };

  const removeBag = (index: number) => {
    setBags(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    // Validation
    if (!newCustomer.firstName || !newCustomer.phoneNumber) {
      toast.error('Please enter customer name and phone number');
      return;
    }

    setLoading(true);
    try {
      let customer = selectedCustomer;

      // Create new customer if not selected
      if (!customer) {
        const customerResponse = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${newCustomer.firstName} ${newCustomer.lastName}`.trim(),
            phoneNumber: newCustomer.phoneNumber,
            address: newCustomer.address,
            buzzerCode: '',
            deliveryFee: `$${newCustomer.deliveryPrice.toFixed(2)}`,
            notes: '',
          }),
        });

        if (!customerResponse.ok) {
          throw new Error('Failed to create customer');
        }
        customer = await customerResponse.json();
      }

      // Convert selected extras to ExtraItemUsage format (handle weight-based items with proportional pricing)
      const extraItemsData = Object.entries(selectedExtraItems)
        .filter(([_, data]) => data.quantity > 0)
        .map(([itemId, data]) => {
          const item = extraItems.find(e => e._id === itemId);
          const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
          // For weight-based: calculate exact proportional cost, then round to nearest quarter
          const totalPrice = isWeightBased
            ? roundToQuarter((weight / item!.perWeightUnit!) * data.price)
            : data.price * data.quantity;
          return {
            itemId,
            name: item?.name || '',
            price: totalPrice, // Store the total calculated price
            quantity: 1, // Quantity is 1 since price is the total
          };
        });

      // Build order data
      const orderData = {
        customerId: customer!.id?.toString() || customer!._id,
        customerName: customer!.name || `${newCustomer.firstName} ${newCustomer.lastName}`.trim(),
        customerPhone: customer!.phoneNumber || newCustomer.phoneNumber,
        orderType,
        status: orderType === 'delivery' && !weight ? 'scheduled_pickup' : 'new_order',
        totalAmount: totalPrice,
        weight: weight,
        bags: bags,
        items: [],
        extraItems: extraItemsData,
        dropOffDate: new Date().toISOString(),
        estimatedPickupDate: orderType === 'delivery'
          ? (scheduledPickupTime ? new Date(scheduledPickupTime).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
          : (inStorePickupDate ? new Date(inStorePickupDate).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
        specialInstructions: notes || '',
        deliverySchedule: orderType === 'delivery' && dropOffDate ? new Date(dropOffDate).toISOString() : undefined,
        scheduledPickupTime: orderType === 'delivery' && scheduledPickupTime ? new Date(scheduledPickupTime).toISOString() : undefined,
        isPaid: markAsPaid,
        paymentMethod: markAsPaid ? paymentMethod : 'pending',
        isSameDay: isSameDay,
        sameDayPricePerPound: isSameDay ? getSameDayPricePerPound() : undefined,
      };

      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to create order');
      }

      const createdOrder = await orderResponse.json();

      // Apply credit if selected
      if (applyCredit && creditToApply > 0 && selectedCustomer) {
        try {
          const creditResponse = await fetch(`/api/customers/${selectedCustomer._id}/credit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: creditToApply,
              type: 'use',
              description: `Applied to Order #${createdOrder.orderId}`,
              orderId: createdOrder._id,
            }),
          });

          if (creditResponse.ok) {
            toast.success(`Applied $${creditToApply.toFixed(2)} credit to order`);
          }
        } catch (creditError) {
          console.error('Failed to apply credit:', creditError);
          // Order was still created, just credit wasn't applied
        }
      }

      toast.success('Order created successfully!');

      // Auto-print receipts for in-store pickup (drop-off) orders
      if (orderType === 'storePickup') {
        try {
          await printerService.printOrderReceipts(createdOrder);
          toast.success('Receipts printed automatically');
        } catch (printError) {
          console.error('Auto-print failed:', printError);
          // Don't show error toast - order was still created successfully
        }
      }

      onSuccess();
    } catch (error) {
      console.error('Failed to create order:', error);
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div
        className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Create New Order</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order Type */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-700 border-b-2 border-gray-200 pb-2">
              Order Type
            </h3>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
            >
              <option value="storePickup">In-Store</option>
              <option value="delivery">Pickup & Delivery</option>
            </select>
          </div>

          {/* Customer Information */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-700 border-b-2 border-gray-200 pb-2">
              Customer Information
            </h3>

            {/* Customer Search */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Search Customer</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type customer name or phone number..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                />
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={clearCustomer}
                    className="px-4 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-100 text-gray-900 bg-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Search Results */}
              {customerResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                  {customerResults.map(customer => (
                    <div
                      key={customer._id}
                      onClick={() => handleCustomerSelect(customer)}
                      className="p-3 cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{customer.name}</div>
                          <div className="text-sm text-gray-600">{customer.phoneNumber}</div>
                        </div>
                        {(customer.credit || 0) > 0 && (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                            ${(customer.credit || 0).toFixed(2)} credit
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isSearching && (
                <div className="text-sm text-gray-500">Searching...</div>
              )}
            </div>

            {/* Customer Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">First Name</label>
                <input
                  type="text"
                  required
                  value={newCustomer.firstName}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, firstName: e.target.value }))}
                  disabled={!!selectedCustomer}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-gray-100 text-gray-900 bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Last Name</label>
                <input
                  type="text"
                  value={newCustomer.lastName}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, lastName: e.target.value }))}
                  disabled={!!selectedCustomer}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-gray-100 text-gray-900 bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={newCustomer.phoneNumber}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  disabled={!!selectedCustomer}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-gray-100 text-gray-900 bg-white"
                />
              </div>
              {orderType === 'delivery' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Delivery Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newCustomer.deliveryPrice}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, deliveryPrice: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                  />
                </div>
              )}
            </div>

            {orderType === 'delivery' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Address</label>
                {selectedCustomer ? (
                  <textarea
                    required
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                    disabled
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-gray-100 min-h-20 resize-y text-gray-900 bg-white"
                    placeholder="Enter delivery address..."
                  />
                ) : (
                  <AddressInput
                    value={newCustomer.address}
                    onChange={(address) => setNewCustomer(prev => ({ ...prev, address }))}
                    placeholder="Enter delivery address..."
                    required
                  />
                )}
              </div>
            )}
          </div>

          {/* Order Details */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-700 border-b-2 border-gray-200 pb-2">
              Order Details
            </h3>

            {/* Delivery Schedule */}
            {orderType === 'delivery' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Pickup Date & Time</label>
                    <input
                      type="datetime-local"
                      value={scheduledPickupTime}
                      onChange={(e) => setScheduledPickupTime(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Delivery Date (2 days after pickup)</label>
                    <input
                      type="date"
                      value={dropOffDate}
                      onChange={(e) => setDropOffDate(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                    />
                  </div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-800">
                  <strong>Note:</strong> After we receive the items at the store, we will call the customer to confirm the actual delivery date.
                </div>
              </>
            )}

            {/* In-Store Pickup Date */}
            {orderType === 'storePickup' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">In-Store Pickup Date (Optional)</label>
                <input
                  type="datetime-local"
                  value={inStorePickupDate}
                  onChange={(e) => setInStorePickupDate(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                />
              </div>
            )}

            {/* Bags Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
                <h3 className="text-base font-semibold text-gray-700">
                  Bags (Total Weight: {weight} lbs)
                </h3>
                <button
                  type="button"
                  onClick={addBag}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white border-2 border-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Add Bag
                </button>
              </div>

              {bags.map((bag, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium text-gray-700">Bag {index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeBag(index)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Weight (lbs)</label>
                      <input
                        type="number"
                        min="0"
                        value={bag.weight || ''}
                        onChange={(e) => updateBag(index, 'weight', parseInt(e.target.value) || 0)}
                        placeholder={orderType === 'delivery' ? 'TBD' : '0'}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Color</label>
                      <input
                        type="text"
                        value={bag.color || ''}
                        onChange={(e) => updateBag(index, 'color', e.target.value)}
                        placeholder="e.g., Blue, Red"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Description</label>
                      <input
                        type="text"
                        value={bag.description || ''}
                        onChange={(e) => updateBag(index, 'description', e.target.value)}
                        placeholder="Optional notes"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 text-gray-900 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {bags.length === 0 && (
                <div className="text-center text-gray-500 py-5 border-2 border-dashed border-gray-200 rounded-lg">
                  {orderType === 'delivery'
                    ? 'Bags will be identified and weighed after pickup. Click "Add Bag" to get started.'
                    : 'No bags added. Click "Add Bag" to get started.'}
                </div>
              )}
            </div>

            {/* Same Day Service Toggle */}
            <div className={`p-4 rounded-lg border ${isSameDay ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSameDay}
                  onChange={(e) => setIsSameDay(e.target.checked)}
                  className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
                />
                <div>
                  <span className={`font-medium text-lg ${isSameDay ? 'text-amber-800' : 'text-gray-700'}`}>Same Day Service</span>
                  <p className={`text-sm ${isSameDay ? 'text-amber-600' : 'text-gray-500'}`}>
                    Extra ${(settings?.sameDayExtraCentsPerPound || 0.33).toFixed(2)}/lb (min ${(settings?.sameDayMinimumCharge || 5).toFixed(2)})
                  </p>
                </div>
              </label>
              {isSameDay && weight > 0 && settings && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-amber-700">Same Day Extra:</span>
                    <span className="font-bold text-amber-700">+${getSameDayExtraCharge().toFixed(2)}</span>
                  </div>
                  {getSameDayExtraCharge() === (settings.sameDayMinimumCharge || 5) && (
                    <p className="text-xs text-amber-600 mt-1">
                      Minimum charge applied (calculated: ${(weight * (settings.sameDayExtraCentsPerPound || 0.33)).toFixed(2)})
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions or notes..."
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-600 min-h-20 resize-y"
              />
            </div>
          </div>

          {/* Extra Items Toggle */}
          {extraItems.length > 0 && !showExtraItems && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowExtraItems(true)}
                className="px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-100 font-medium text-gray-900 bg-white"
              >
                Add Extra Items
              </button>
            </div>
          )}

          {/* Extra Items */}
          {extraItems.length > 0 && showExtraItems && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
                <h3 className="text-base font-semibold text-gray-700">Available Extra Items</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowExtraItems(false);
                    setSelectedExtraItems({});
                  }}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Hide Extra Items
                </button>
              </div>
              <div className="space-y-3">
                {extraItems.map(item => {
                  const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                  const data = selectedExtraItems[item._id] || { quantity: 0, price: item.price };
                  const isEnabled = data.quantity > 0 || selectedExtraItems[item._id] !== undefined;
                  // For weight-based: calculate exact proportional cost, then round to nearest quarter
                  const itemTotal = isWeightBased && isEnabled && weight > 0
                    ? roundToQuarter((weight / item.perWeightUnit!) * data.price)
                    : data.price * data.quantity;

                  return (
                    <div
                      key={item._id}
                      className={`p-3 border rounded-lg ${isEnabled && (isWeightBased ? weight > 0 : data.quantity > 0) ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'}`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div className="font-medium text-gray-700">{item.name}</div>
                          <div className="text-sm text-gray-500">
                            {item.description && `${item.description} - `}
                            ${item.price.toFixed(2)}{isWeightBased ? ` per ${item.perWeightUnit} lbs` : ' each'}
                          </div>
                          {isWeightBased && weight > 0 && isEnabled && (
                            <div className="text-sm text-purple-600 font-medium mt-1">
                              {weight} lbs @ ${data.price}/{item.perWeightUnit} lbs = ${itemTotal.toFixed(2)}
                            </div>
                          )}
                          {isWeightBased && weight === 0 && (
                            <div className="text-xs text-gray-400 italic mt-1">Add bag weight to calculate</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isWeightBased ? (
                            // Weight-based items use a toggle switch
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => {
                                  if (e.target.checked) {
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
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                            </label>
                          ) : (
                            // Regular items use +/- quantity controls
                            <>
                              <button
                                type="button"
                                onClick={() => setSelectedExtraItems(prev => {
                                  const current = prev[item._id] || { quantity: 0, price: item.price };
                                  const newQty = Math.max(0, current.quantity - 1);
                                  if (newQty === 0) {
                                    const { [item._id]: _, ...rest } = prev;
                                    return rest;
                                  }
                                  return { ...prev, [item._id]: { ...current, quantity: newQty } };
                                })}
                                className="w-8 h-8 bg-red-600 text-white rounded hover:bg-red-700 font-bold"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-semibold">
                                {data.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedExtraItems(prev => {
                                  const current = prev[item._id] || { quantity: 0, price: item.price };
                                  return { ...prev, [item._id]: { ...current, quantity: current.quantity + 1 } };
                                })}
                                className="w-8 h-8 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-bold"
                              >
                                +
                              </button>
                            </>
                          )}
                          <span className="ml-2 min-w-16 text-right font-semibold text-gray-700">
                            ${itemTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {/* Price editing row - shown when item is selected */}
                      {isEnabled && (isWeightBased ? weight > 0 : data.quantity > 0) && (
                        <div className="mt-3 pt-3 border-t border-purple-200 flex items-center gap-2">
                          <span className="text-sm text-gray-600">
                            {isWeightBased ? `Price per ${item.perWeightUnit} lbs:` : 'Price per item:'}
                          </span>
                          <div className="flex items-center border border-gray-300 rounded px-2 bg-white">
                            <span className="text-gray-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={data.price}
                              onChange={(e) => {
                                const newPrice = parseFloat(e.target.value) || 0;
                                setSelectedExtraItems(prev => ({
                                  ...prev,
                                  [item._id]: { ...prev[item._id], price: newPrice }
                                }));
                              }}
                              className="w-16 py-1 text-center focus:outline-none"
                            />
                          </div>
                          <span className="text-sm font-semibold text-purple-700">
                            = ${itemTotal.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Extra Items Summary */}
          {Object.keys(selectedExtraItems).some(itemId => selectedExtraItems[itemId]?.quantity > 0) && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-700 border-b-2 border-gray-200 pb-2">
                Selected Extra Items
              </h3>
              <div className="space-y-2">
                {Object.entries(selectedExtraItems)
                  .filter(([, data]) => data.quantity > 0)
                  .map(([itemId, data]) => {
                    const item = extraItems.find(i => i._id === itemId);
                    if (!item) return null;

                    const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                    // For weight-based: calculate exact proportional cost, then round to nearest quarter
                    const itemTotal = isWeightBased
                      ? roundToQuarter((weight / item.perWeightUnit!) * data.price)
                      : data.price * data.quantity;

                    return (
                      <div
                        key={itemId}
                        className="flex justify-between items-center p-3 border border-purple-300 rounded-lg bg-purple-50"
                      >
                        <div>
                          <span className="font-medium">{item.name}</span>
                          <span className="text-gray-500 ml-2">
                            ${data.price.toFixed(2)} {isWeightBased ? `per ${item.perWeightUnit} lbs` : 'each'}
                          </span>
                          {isWeightBased && (
                            <span className="text-purple-600 ml-2 text-sm">
                              ({weight} lbs @ ${data.price}/{item.perWeightUnit} lbs)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!isWeightBased && <span className="font-semibold">× {data.quantity}</span>}
                          <span className="ml-2 min-w-16 text-right font-semibold text-purple-700">
                            ${itemTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Customer Credit */}
          {selectedCustomer && (selectedCustomer.credit || 0) > 0 && (
            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium text-green-800">Available Credit</div>
                  <div className="text-2xl font-bold text-green-700">
                    ${(selectedCustomer.credit || 0).toFixed(2)}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyCredit}
                    onChange={(e) => {
                      setApplyCredit(e.target.checked);
                      if (e.target.checked) {
                        const availableCredit = selectedCustomer.credit || 0;
                        setCreditToApply(Math.min(availableCredit, totalPrice));
                      } else {
                        setCreditToApply(0);
                      }
                    }}
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                  />
                  <span className="text-green-800 font-medium">Apply Credit</span>
                </label>
              </div>
              {applyCredit && (
                <div className="mt-3 pt-3 border-t border-green-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-green-700">Credit Applied:</span>
                    <span className="font-bold text-green-700">-${creditToApply.toFixed(2)}</span>
                  </div>
                  {(selectedCustomer.credit || 0) >= totalPrice && (
                    <div className="mt-1 text-xs text-green-600">
                      Remaining credit after order: ${((selectedCustomer.credit || 0) - creditToApply).toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mark as Paid */}
          <div className={`p-4 rounded-lg border ${markAsPaid ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={markAsPaid}
                onChange={(e) => setMarkAsPaid(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              />
              <div>
                <span className={`font-medium text-lg ${markAsPaid ? 'text-green-800' : 'text-blue-800'}`}>Mark as Paid</span>
                <p className={`text-sm ${markAsPaid ? 'text-green-600' : 'text-blue-600'}`}>Check if customer has already paid for this order</p>
              </div>
            </label>
            {markAsPaid && (
              <div className="mt-4 pt-4 border-t border-green-200">
                <label className="text-sm font-medium text-green-800 mb-2 block">Payment Method</label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        paymentMethod === method.value
                          ? 'bg-green-600 text-white'
                          : 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Price Breakdown */}
          <div className="bg-gray-100 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-gray-700 text-sm mb-3">Price Breakdown</h4>
            {getPriceBreakdown().length > 0 ? (
              <>
                {getPriceBreakdown().map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-gray-600 text-sm">
                    <span>{item.label}</span>
                    <span>${item.amount.toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-300 pt-2 mt-2">
                  {applyCredit && creditToApply > 0 && (
                    <>
                      <div className="flex justify-between items-center text-gray-600 text-sm">
                        <span>Subtotal:</span>
                        <span>${totalPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-green-600 text-sm">
                        <span>Credit Applied:</span>
                        <span>-${creditToApply.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center font-semibold text-gray-700 mt-1">
                    <span>Total Due:</span>
                    <span className="text-xl">${Math.max(0, totalPrice - creditToApply).toFixed(2)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-sm italic">Add items to see price breakdown</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-100 text-gray-900 bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
