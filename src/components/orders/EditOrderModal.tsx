'use client';

import { useState, useEffect, useCallback } from 'react';
import { Order, ExtraItem, Settings, Bag, OrderType, OrderExtraItem } from '@/types';
import toast from 'react-hot-toast';

interface EditOrderModalProps {
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditOrderModal({ order, onClose, onSuccess }: EditOrderModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [weight, setWeight] = useState<number>(0);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [selectedExtraItems, setSelectedExtraItems] = useState<Record<string, { quantity: number; price: number }>>({}); // Stores quantity and custom price
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [bags, setBags] = useState<Bag[]>([]);
  const [showExtraItems, setShowExtraItems] = useState(false);

  // Price override functionality
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [priceChangeNote, setPriceChangeNote] = useState('');
  const [showPriceOverride, setShowPriceOverride] = useState(false);

  // Delivery parameters
  const [orderType, setOrderType] = useState<OrderType>('storePickup');
  const [scheduledPickupTime, setScheduledPickupTime] = useState('');
  const [dropOffDate, setDropOffDate] = useState('');
  const [estimatedPickupDate, setEstimatedPickupDate] = useState('');
  const [deliverySchedule, setDeliverySchedule] = useState('');
  const [deliveryPrice, setDeliveryPrice] = useState<number>(0);

  // Same day service
  const [isSameDay, setIsSameDay] = useState(false);

  const populateOrderData = useCallback(() => {
    setCustomerName(order.customerName || '');
    setCustomerPhone(order.customerPhone || '');
    setCustomerAddress(order.customer?.address || '');
    setWeight(order.weight || 0);
    setSpecialInstructions(order.specialInstructions || '');

    // Delivery parameters
    setOrderType(order.orderType || 'storePickup');
    setScheduledPickupTime(order.scheduledPickupTime ? new Date(order.scheduledPickupTime).toISOString().slice(0, 16) : '');
    setDropOffDate(order.dropOffDate ? new Date(order.dropOffDate).toISOString().slice(0, 10) : '');
    setEstimatedPickupDate(order.estimatedPickupDate ? new Date(order.estimatedPickupDate).toISOString().slice(0, 16) : '');
    setDeliverySchedule(order.deliverySchedule ? new Date(order.deliverySchedule).toISOString().slice(0, 16) : '');

    // Get delivery price from customer data
    if (order.customer?.deliveryFee) {
      setDeliveryPrice(parseFloat(order.customer.deliveryFee.replace('$', '')) || 0);
    }

    // Populate existing extra items
    if (order.extraItems) {
      const extraItemsMap: Record<string, { quantity: number; price: number }> = {};
      order.extraItems.forEach((item: OrderExtraItem) => {
        extraItemsMap[item.item._id] = {
          quantity: item.quantity,
          price: item.price / item.quantity // Get per-unit price
        };
      });
      setSelectedExtraItems(extraItemsMap);
      // Show extra items section if there are existing items
      setShowExtraItems(Object.values(extraItemsMap).some(data => data.quantity > 0));
    }

    // Populate existing bags
    if (order.bags) {
      setBags(order.bags);
    }

    // Check if there's a price override
    if (order.priceOverride) {
      setPriceOverride(order.priceOverride);
      setShowPriceOverride(true);
      setPriceChangeNote(order.priceChangeNote || '');
    }

    // Same day service
    setIsSameDay(order.isSameDay || false);
  }, [order]);

  useEffect(() => {
    loadInitialData();
    populateOrderData();
  }, [populateOrderData]);

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
      toast.error('Failed to load settings');
    }
  };

  // Helper function to round to nearest quarter (0.25)
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

  // Calculate same day extra charge (rounded to nearest quarter)
  const getSameDayExtraCharge = (): number => {
    if (!settings || !isSameDay || weight <= 0) return 0;

    const extraCentsPerPound = settings.sameDayExtraCentsPerPound || 0.33;
    const calculatedExtra = weight * extraCentsPerPound;

    // Use minimum charge if calculated is less, then round to nearest quarter
    const minimumCharge = settings.sameDayMinimumCharge || 5;
    return roundToQuarter(Math.max(calculatedExtra, minimumCharge));
  };

  // Calculate laundry base price (tiered pricing, rounded to nearest quarter)
  const calculateLaundryPrice = (): number => {
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
  };

  const calculateTotalPrice = () => {
    if (!settings) return order.totalAmount || 0;

    // Calculate laundry price using tiered pricing
    let basePrice = calculateLaundryPrice();

    // Add same day extra charge
    const sameDayExtra = getSameDayExtraCharge();

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

    // Add delivery price if it's a delivery order
    let deliveryFee = 0;
    if (orderType === 'delivery' && deliveryPrice > 0) {
      deliveryFee = deliveryPrice;
    }

    return basePrice + sameDayExtra + extraItemsTotal + deliveryFee;
  };

  const getFinalPrice = () => {
    return priceOverride !== null ? priceOverride : calculateTotalPrice();
  };

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

  // Calculate total weight from all bags
  const calculateTotalWeight = useCallback(() => {
    return bags.reduce((total, bag) => total + (bag.weight || 0), 0);
  }, [bags]);

  // Calculate quantity for weight-based items (e.g., "per 15 lbs")
  const calculateWeightBasedQuantity = useCallback((perWeightUnit: number, totalWeight: number): number => {
    if (perWeightUnit <= 0 || totalWeight <= 0) return 0;
    return Math.ceil(totalWeight / perWeightUnit);
  }, []);

  // Update the main weight when bags change
  useEffect(() => {
    const totalWeight = calculateTotalWeight();
    setWeight(totalWeight);
  }, [calculateTotalWeight]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const orderExtraItems = Object.entries(selectedExtraItems)
        .filter(([, data]) => data.quantity > 0)
        .map(([itemId, data]) => {
          const item = extraItems.find(i => i._id === itemId);
          const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
          // For weight-based: calculate exact proportional cost, then round to nearest quarter
          const totalPrice = isWeightBased
            ? roundToQuarter((weight / item!.perWeightUnit!) * data.price)
            : data.price * data.quantity;
          return {
            item: item!,
            quantity: 1, // Quantity is 1 since price is the total
            price: totalPrice
          };
        });

      const updates: Partial<Order> = {
        customerName,
        customerPhone,
        weight: weight || undefined,
        specialInstructions,
        totalAmount: getFinalPrice(),
        priceOverride: priceOverride || undefined,
        priceChangeNote: priceChangeNote || undefined,
        extraItems: orderExtraItems,
        bags: bags,
        orderType,
        scheduledPickupTime: scheduledPickupTime ? new Date(scheduledPickupTime) : undefined,
        dropOffDate: dropOffDate ? new Date(dropOffDate) : undefined,
        estimatedPickupDate: estimatedPickupDate ? new Date(estimatedPickupDate) : undefined,
        deliverySchedule: deliverySchedule ? new Date(deliverySchedule) : undefined,
        // Same day service
        isSameDay,
        sameDayPricePerPound: isSameDay ? getSameDayPricePerPound() : undefined,
      };

      // Update customer address if it's a delivery order
      if (orderType === 'delivery' && order.customer && customerAddress !== order.customer.address) {
        try {
          await fetch(`/api/customers/${order.customer._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: customerAddress,
              deliveryFee: `$${deliveryPrice.toFixed(2)}`,
            }),
          });
        } catch (error) {
          console.error('Failed to update customer address:', error);
          toast.error('Order updated but failed to update customer address');
        }
      }

      const response = await fetch(`/api/orders/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error('Failed to update order');

      toast.success('Order updated successfully');
      onSuccess();
    } catch (error) {
      console.error('Failed to update order:', error);
      toast.error('Failed to update order');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this order? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${order._id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete order');

      toast.success('Order deleted successfully');
      onSuccess();
    } catch (error) {
      console.error('Failed to delete order:', error);
      toast.error('Failed to delete order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800">
            Edit Order #{order.orderNumber || order.orderId || order._id.slice(-6)}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Information */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-700 border-b-2 border-gray-200 pb-2">
                Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              {orderType === 'delivery' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Enter delivery address"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-y min-h-[80px]"
                  />
                </div>
              )}
            </div>

            {/* Order Details */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-700 border-b-2 border-gray-200 pb-2">
                Order Details
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Order Type
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as OrderType)}
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none bg-white"
                >
                  <option value="storePickup">In-Store</option>
                  <option value="delivery">Pickup & Delivery</option>
                </select>
              </div>

              {orderType === 'delivery' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Scheduled Pickup Time
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduledPickupTime}
                        onChange={(e) => setScheduledPickupTime(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Drop-off Date
                      </label>
                      <input
                        type="date"
                        value={dropOffDate}
                        onChange={(e) => setDropOffDate(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estimated Pickup Date
                      </label>
                      <input
                        type="datetime-local"
                        value={estimatedPickupDate}
                        onChange={(e) => setEstimatedPickupDate(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Delivery Schedule
                      </label>
                      <input
                        type="datetime-local"
                        value={deliverySchedule}
                        onChange={(e) => setDeliverySchedule(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Delivery Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={deliveryPrice}
                        onChange={(e) => setDeliveryPrice(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Special Instructions
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="Any special instructions or notes..."
                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none resize-y min-h-[80px]"
                />
              </div>

              {/* Same Day Service Toggle */}
              <div className={`p-4 rounded-lg border-2 ${isSameDay ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="sameDay"
                      checked={isSameDay}
                      onChange={(e) => setIsSameDay(e.target.checked)}
                      className="w-5 h-5 text-amber-600 border-2 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <label htmlFor="sameDay" className="font-medium text-gray-800 cursor-pointer">
                      Same Day Service
                    </label>
                  </div>
                  {isSameDay && settings && (
                    <span className="px-3 py-1 bg-amber-500 text-white text-sm font-medium rounded-full">
                      ${getSameDayPricePerPound().toFixed(2)}/lb
                    </span>
                  )}
                </div>
                {isSameDay && settings && (
                  <div className="mt-3 text-sm text-amber-800">
                    <p>
                      Regular: ${settings.pricePerPound?.toFixed(2)}/lb →
                      Same Day: <strong>${getSameDayPricePerPound().toFixed(2)}/lb</strong>
                    </p>
                    <p className="mt-1">
                      Extra charge: <strong>${getSameDayExtraCharge().toFixed(2)}</strong>
                      {getSameDayExtraCharge() === (settings.sameDayMinimumCharge || 5) && weight > 0 && (
                        <span className="text-amber-600 ml-1">(minimum charge applied)</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Extra Items Toggle */}
            {extraItems.length > 0 && !showExtraItems && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowExtraItems(true)}
                  className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Add Extra Items
                </button>
              </div>
            )}

            {/* Extra Items Section */}
            {extraItems.length > 0 && showExtraItems && (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
                  <h3 className="text-base font-semibold text-gray-700">Extra Items</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowExtraItems(false);
                      setSelectedExtraItems({});
                    }}
                    className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
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
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">{item.name}</div>
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
                                  className="w-8 h-8 flex items-center justify-center text-white bg-red-600 rounded-lg hover:bg-red-700 font-bold"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center font-semibold">
                                  {data.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedExtraItems(prev => {
                                    const current = prev[item._id] || { quantity: 0, price: item.price };
                                    return { ...prev, [item._id]: { ...current, quantity: current.quantity + 1 } };
                                  })}
                                  className="w-8 h-8 flex items-center justify-center text-white bg-green-600 rounded-lg hover:bg-green-700 font-bold"
                                >
                                  +
                                </button>
                              </>
                            )}
                            <span className="w-16 text-right font-semibold text-gray-800">
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

            {/* Bags Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b-2 border-gray-200 pb-2">
                <h3 className="text-base font-semibold text-gray-700">
                  Bags (Total Weight: {calculateTotalWeight().toFixed(1)} lbs)
                </h3>
                <button
                  type="button"
                  onClick={addBag}
                  className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Add Bag
                </button>
              </div>

              {bags.map((bag, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">Bag {index + 1}</h4>
                    <button
                      type="button"
                      onClick={() => removeBag(index)}
                      className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Weight (lbs)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={bag.weight}
                        onChange={(e) => updateBag(index, 'weight', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Color
                      </label>
                      <input
                        type="text"
                        value={bag.color || ''}
                        onChange={(e) => updateBag(index, 'color', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={bag.description || ''}
                        onChange={(e) => updateBag(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {bags.length === 0 && (
                <div className="text-center text-gray-500 py-5 border-2 border-dashed border-gray-200 rounded-lg">
                  No bags added. Click "Add Bag" to get started.
                </div>
              )}
            </div>

            {/* Pricing Section */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-700 border-b-2 border-gray-200 pb-2">
                Pricing
              </h3>

              <div className="bg-gray-100 p-4 rounded-lg">
                {/* Price breakdown */}
                {settings && weight > 0 && (
                  <div className="space-y-1 mb-3 text-sm text-gray-600 border-b border-gray-300 pb-3">
                    {weight <= settings.minimumWeight ? (
                      <div className="flex justify-between">
                        <span>Base (up to {settings.minimumWeight} lbs):</span>
                        <span>${settings.minimumPrice?.toFixed(2)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span>Base (first {settings.minimumWeight} lbs):</span>
                          <span>${settings.minimumPrice?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Extra {(weight - settings.minimumWeight).toFixed(1)} lbs × ${settings.pricePerPound?.toFixed(2)}:</span>
                          <span>${roundToQuarter((weight - settings.minimumWeight) * settings.pricePerPound).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    {isSameDay && (
                      <div className="flex justify-between text-amber-700">
                        <span>Same Day Extra:</span>
                        <span>+${getSameDayExtraCharge().toFixed(2)}</span>
                      </div>
                    )}
                    {Object.entries(selectedExtraItems).filter(([, data]) => data.quantity > 0).length > 0 && (
                      <>
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
                              <div key={itemId} className="flex justify-between">
                                <span>
                                  {isWeightBased
                                    ? `${item.name} (${weight}lbs @ $${data.price}/${item.perWeightUnit}lbs):`
                                    : `${item.name} × ${data.quantity}:`}
                                </span>
                                <span>+${itemTotal.toFixed(2)}</span>
                              </div>
                            );
                          })}
                      </>
                    )}
                    {orderType === 'delivery' && deliveryPrice > 0 && (
                      <div className="flex justify-between">
                        <span>Delivery Fee:</span>
                        <span>+${deliveryPrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center font-semibold text-gray-700 mb-2">
                  <span>Calculated Price:</span>
                  <span>${calculateTotalPrice().toFixed(2)}</span>
                </div>

                {priceOverride !== null && (
                  <div className="flex justify-between items-center font-semibold text-red-600 text-lg">
                    <span>Override Price:</span>
                    <span>${priceOverride.toFixed(2)}</span>
                  </div>
                )}

                {priceOverride === null && (
                  <div className="flex justify-between items-center font-semibold text-green-600 text-lg">
                    <span>Final Price:</span>
                    <span>${calculateTotalPrice().toFixed(2)}</span>
                  </div>
                )}
              </div>

              {!showPriceOverride && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPriceOverride(true);
                      setPriceOverride(calculateTotalPrice());
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Override Price
                  </button>
                </div>
              )}

              {showPriceOverride && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Override Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceOverride || 0}
                        onChange={(e) => setPriceOverride(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reason for Price Change <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required={showPriceOverride}
                        value={priceChangeNote}
                        onChange={(e) => setPriceChangeNote(e.target.value)}
                        placeholder="e.g., Customer requested additional service"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPriceOverride(false);
                        setPriceOverride(null);
                        setPriceChangeNote('');
                      }}
                      className="px-3 py-1 text-xs font-medium text-white bg-gray-500 rounded-lg hover:bg-gray-600"
                    >
                      Remove Price Override
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-6 py-3 font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Order
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 font-semibold text-gray-700 bg-white border-2 border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || (showPriceOverride && !priceChangeNote.trim())}
                className="px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Updating...' : 'Update Order'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
