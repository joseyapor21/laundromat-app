'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Order, Customer, ExtraItem, Settings, Bag, PaymentMethod } from '@/types';
import POSCustomerPanel from './POSCustomerPanel';
import POSOrderPanel from './POSOrderPanel';
import POSOrdersPanel from './POSOrdersPanel';
import POSActionBar from './POSActionBar';
import { printerService } from '@/services/printerService';
import toast from 'react-hot-toast';

interface POSLayoutProps {
  orders: Order[];
  onOrderCreated: () => void;
  onExitPOS: () => void;
  currentUser: any;
}

export default function POSLayout({ orders, onOrderCreated, onExitPOS, currentUser }: POSLayoutProps) {
  // Customer state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Order state
  const [bags, setBags] = useState<Bag[]>([]);
  const [selectedExtraItems, setSelectedExtraItems] = useState<Record<string, { quantity: number; price: number }>>({});
  const [isSameDay, setIsSameDay] = useState(false);
  const [notes, setNotes] = useState('');

  // Settings and extra items
  const [settings, setSettings] = useState<Settings | null>(null);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);

  // Selected order for status updates
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Loading state
  const [loading, setLoading] = useState(false);

  // Load settings and extra items
  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsRes, extraItemsRes] = await Promise.all([
          fetch('/api/settings'),
          fetch('/api/extra-items'),
        ]);

        if (settingsRes.ok) {
          setSettings(await settingsRes.json());
        }
        if (extraItemsRes.ok) {
          const items = await extraItemsRes.json();
          setExtraItems(items.filter((item: ExtraItem) => item.isActive));
        }
      } catch (error) {
        console.error('Failed to load POS data:', error);
      }
    };
    loadData();
  }, []);

  // Calculate total weight
  const totalWeight = bags.reduce((sum, bag) => sum + (bag.weight || 0), 0);

  // Helper function to round to nearest quarter
  const roundToQuarter = (value: number): number => {
    return Math.round(value * 4) / 4;
  };

  // Calculate laundry price
  const calculateLaundryPrice = useCallback((): number => {
    if (!settings || totalWeight <= 0) return 0;

    if (isSameDay) {
      const basePrice = settings.sameDayBasePrice ?? 12;
      const threshold = settings.sameDayWeightThreshold ?? 7;
      const pricePerPound = settings.sameDayPricePerPound ?? 1.60;

      if (totalWeight <= threshold) return basePrice;
      return basePrice + ((totalWeight - threshold) * pricePerPound);
    }

    const minWeight = settings.minimumWeight || 8;
    const pricePerPound = settings.pricePerPound || 1.25;
    const minPrice = settings.minimumPrice || 8;

    if (totalWeight <= minWeight) return minPrice;
    return roundToQuarter(minPrice + ((totalWeight - minWeight) * pricePerPound));
  }, [settings, totalWeight, isSameDay]);

  // Calculate total price
  const calculateTotalPrice = useCallback((): number => {
    let total = calculateLaundryPrice();

    // Add extra items
    Object.entries(selectedExtraItems).forEach(([itemId, data]) => {
      if (data.quantity > 0) {
        const item = extraItems.find(i => i._id === itemId);
        const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
        const itemTotal = isWeightBased
          ? roundToQuarter((totalWeight / item.perWeightUnit!) * data.price)
          : data.price * data.quantity;
        total += itemTotal;
      }
    });

    return total;
  }, [calculateLaundryPrice, selectedExtraItems, extraItems, totalWeight]);

  // Clear form
  const handleClear = () => {
    setSelectedCustomer(null);
    setBags([]);
    setSelectedExtraItems({});
    setIsSameDay(false);
    setNotes('');
    setSelectedOrder(null);
  };

  // Create order
  const handleCreateOrder = async () => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return;
    }
    if (bags.length === 0 || totalWeight === 0) {
      toast.error('Please add at least one bag with weight');
      return;
    }

    setLoading(true);
    try {
      // Convert extra items
      const extraItemsData = Object.entries(selectedExtraItems)
        .filter(([_, data]) => data.quantity > 0)
        .map(([itemId, data]) => {
          const item = extraItems.find(e => e._id === itemId);
          const isWeightBased = item?.perWeightUnit && item.perWeightUnit > 0;
          const totalPrice = isWeightBased
            ? roundToQuarter((totalWeight / item!.perWeightUnit!) * data.price)
            : data.price * data.quantity;
          return {
            itemId,
            name: item?.name || '',
            price: totalPrice,
            quantity: 1,
          };
        });

      const orderData = {
        customerId: selectedCustomer.id?.toString() || selectedCustomer._id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phoneNumber,
        orderType: 'storePickup',
        status: 'new_order',
        totalAmount: calculateTotalPrice(),
        weight: totalWeight,
        bags: bags,
        items: [],
        extraItems: extraItemsData,
        dropOffDate: new Date().toISOString(),
        estimatedPickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        specialInstructions: notes || '',
        isPaid: false,
        isSameDay: isSameDay,
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) throw new Error('Failed to create order');

      const createdOrder = await response.json();
      toast.success(`Order #${createdOrder.orderId} created!`);

      // Auto-print receipts
      try {
        await printerService.printOrderReceipts(createdOrder);
      } catch (e) {
        console.error('Print failed:', e);
      }

      handleClear();
      onOrderCreated();
    } catch (error) {
      console.error('Failed to create order:', error);
      toast.error('Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  // Print receipt for selected order
  const handlePrintReceipt = async () => {
    if (!selectedOrder) {
      toast.error('Select an order to print');
      return;
    }
    try {
      await printerService.printOrderReceipts(selectedOrder);
      toast.success('Receipt printed');
    } catch (error) {
      toast.error('Print failed');
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col bg-gray-100">
      {/* Main Content - 3 Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Customer */}
        <POSCustomerPanel
          selectedCustomer={selectedCustomer}
          onSelectCustomer={setSelectedCustomer}
        />

        {/* Center Panel - Order Entry */}
        <POSOrderPanel
          bags={bags}
          setBags={setBags}
          extraItems={extraItems}
          selectedExtraItems={selectedExtraItems}
          setSelectedExtraItems={setSelectedExtraItems}
          isSameDay={isSameDay}
          setIsSameDay={setIsSameDay}
          notes={notes}
          setNotes={setNotes}
          settings={settings}
          totalWeight={totalWeight}
          totalPrice={calculateTotalPrice()}
        />

        {/* Right Panel - Active Orders */}
        <POSOrdersPanel
          orders={orders}
          selectedOrder={selectedOrder}
          onSelectOrder={setSelectedOrder}
          onOrderUpdated={onOrderCreated}
        />
      </div>

      {/* Bottom Action Bar */}
      <POSActionBar
        onCreateOrder={handleCreateOrder}
        onPrintReceipt={handlePrintReceipt}
        onClear={handleClear}
        onExit={onExitPOS}
        loading={loading}
        canCreate={!!selectedCustomer && bags.length > 0 && totalWeight > 0}
        canPrint={!!selectedOrder}
        totalPrice={calculateTotalPrice()}
      />
    </div>
  );
}
