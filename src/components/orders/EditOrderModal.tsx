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
  const [selectedExtraItems, setSelectedExtraItems] = useState<Record<string, number>>({});
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
      const extraItemsMap: Record<string, number> = {};
      order.extraItems.forEach((item: OrderExtraItem) => {
        extraItemsMap[item.item._id] = item.quantity;
      });
      setSelectedExtraItems(extraItemsMap);
      // Show extra items section if there are existing items
      setShowExtraItems(Object.values(extraItemsMap).some(qty => qty > 0));
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

  const calculateTotalPrice = () => {
    if (!settings) return order.totalAmount || 0;

    let basePrice = 0;
    if (weight > 0) {
      // Calculate price based on weight
      if (weight >= settings.minimumWeight) {
        basePrice = weight * settings.pricePerPound;
      } else {
        basePrice = settings.minimumPrice;
      }
    }

    const extraItemsTotal = Object.entries(selectedExtraItems).reduce((total, [itemId, quantity]) => {
      const item = extraItems.find(i => i._id === itemId);
      return total + (item ? item.price * quantity : 0);
    }, 0);

    // Add delivery price if it's a delivery order
    let deliveryFee = 0;
    if (orderType === 'delivery' && deliveryPrice > 0) {
      deliveryFee = deliveryPrice;
    }

    return basePrice + extraItemsTotal + deliveryFee;
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

  // Update the main weight when bags change
  useEffect(() => {
    const totalWeight = calculateTotalWeight();
    setWeight(totalWeight);
  }, [calculateTotalWeight]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const orderExtraItems = Object.entries(selectedExtraItems)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => {
          const item = extraItems.find(i => i._id === itemId);
          return {
            item: item!,
            quantity,
            price: item!.price * quantity
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
      onClick={onClose}
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
                  {extraItems.map(item => (
                    <div
                      key={item._id}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{item.name}</div>
                        <div className="text-sm text-gray-500">
                          {item.description} - ${item.price.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedExtraItems(prev => ({
                            ...prev,
                            [item._id]: Math.max(0, (prev[item._id] || 0) - 1)
                          }))}
                          className="w-8 h-8 flex items-center justify-center text-white bg-red-600 rounded-lg hover:bg-red-700 font-bold"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-semibold">
                          {selectedExtraItems[item._id] || 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedExtraItems(prev => ({
                            ...prev,
                            [item._id]: (prev[item._id] || 0) + 1
                          }))}
                          className="w-8 h-8 flex items-center justify-center text-white bg-green-600 rounded-lg hover:bg-green-700 font-bold"
                        >
                          +
                        </button>
                        <span className="w-16 text-right font-semibold text-gray-800">
                          ${((selectedExtraItems[item._id] || 0) * item.price).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
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
