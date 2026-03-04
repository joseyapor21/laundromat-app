'use client';

import React, { useState, useEffect } from 'react';
import { ExtraItem, Settings, Bag } from '@/types';

interface POSOrderPanelProps {
  bags: Bag[];
  setBags: React.Dispatch<React.SetStateAction<Bag[]>>;
  extraItems: ExtraItem[];
  selectedExtraItems: Record<string, { quantity: number; price: number }>;
  setSelectedExtraItems: React.Dispatch<React.SetStateAction<Record<string, { quantity: number; price: number }>>>;
  isSameDay: boolean;
  setIsSameDay: React.Dispatch<React.SetStateAction<boolean>>;
  notes: string;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  settings: Settings | null;
  totalWeight: number;
  totalPrice: number;
}

export default function POSOrderPanel({
  bags,
  setBags,
  extraItems,
  selectedExtraItems,
  setSelectedExtraItems,
  isSameDay,
  setIsSameDay,
  notes,
  setNotes,
  settings,
  totalWeight,
  totalPrice,
}: POSOrderPanelProps) {
  const [weightInput, setWeightInput] = useState('');
  const [selectedBagIndex, setSelectedBagIndex] = useState<number | null>(null);

  // Numpad handler
  const handleNumpad = (key: string) => {
    if (key === 'C') {
      setWeightInput('');
    } else if (key === '.') {
      if (!weightInput.includes('.')) {
        setWeightInput(prev => prev + '.');
      }
    } else {
      setWeightInput(prev => prev + key);
    }
  };

  // Add bag with current weight
  const addBagWithWeight = (bagCount: number = 1) => {
    const weight = parseFloat(weightInput) || 0;
    if (weight <= 0) return;

    const newBags: Bag[] = [];
    for (let i = 0; i < bagCount; i++) {
      newBags.push({
        identifier: `Bag ${bags.length + i + 1}`,
        weight: weight,
        color: '',
        description: '',
      });
    }
    setBags(prev => [...prev, ...newBags]);
    setWeightInput('');
  };

  // Update selected bag weight
  const updateSelectedBagWeight = () => {
    if (selectedBagIndex === null) return;
    const weight = parseFloat(weightInput) || 0;
    setBags(prev => prev.map((bag, i) =>
      i === selectedBagIndex ? { ...bag, weight } : bag
    ));
    setWeightInput('');
    setSelectedBagIndex(null);
  };

  // Remove bag
  const removeBag = (index: number) => {
    setBags(prev => prev.filter((_, i) => i !== index));
    if (selectedBagIndex === index) setSelectedBagIndex(null);
  };

  // Toggle extra item
  const toggleExtraItem = (item: ExtraItem) => {
    const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
    const isSelected = selectedExtraItems[item._id] !== undefined;

    if (isSelected) {
      setSelectedExtraItems(prev => {
        const { [item._id]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setSelectedExtraItems(prev => ({
        ...prev,
        [item._id]: { quantity: 1, price: item.price },
      }));
    }
  };

  // Adjust quantity-based item
  const adjustItemQuantity = (itemId: string, delta: number) => {
    setSelectedExtraItems(prev => {
      const current = prev[itemId];
      if (!current) return prev;
      const newQty = Math.max(0, current.quantity + delta);
      if (newQty === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...current, quantity: newQty } };
    });
  };

  // Update weight-based items when total weight changes
  useEffect(() => {
    setSelectedExtraItems(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      Object.keys(updated).forEach(itemId => {
        const item = extraItems.find(e => e._id === itemId);
        if (item?.perWeightUnit && item.perWeightUnit > 0) {
          const newQty = totalWeight / item.perWeightUnit;
          if (updated[itemId].quantity !== newQty) {
            updated[itemId] = { ...updated[itemId], quantity: newQty };
            hasChanges = true;
          }
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [totalWeight, extraItems, setSelectedExtraItems]);

  // Round to quarter helper
  const roundToQuarter = (value: number): number => Math.round(value * 4) / 4;

  return (
    <div className="flex-1 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Order Entry</h2>
        <div className="text-2xl font-bold text-blue-600">
          {totalWeight} lbs
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-6">
          {/* Left Side - Numpad and Bags */}
          <div className="flex-1">
            {/* Weight Display */}
            <div className="mb-4 p-4 bg-gray-100 rounded-xl text-center">
              <div className="text-sm text-gray-500 mb-1">
                {selectedBagIndex !== null ? `Editing Bag ${selectedBagIndex + 1}` : 'Enter Weight'}
              </div>
              <div className="text-4xl font-bold text-gray-800">
                {weightInput || '0'} <span className="text-xl text-gray-500">lbs</span>
              </div>
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '.'].map(key => (
                <button
                  key={key}
                  onClick={() => handleNumpad(key)}
                  className={`w-[70px] h-[70px] text-2xl font-bold rounded-xl active:scale-95 transition-transform touch-manipulation
                    ${key === 'C' ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Quick Add Bag Buttons */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 2, 3].map(count => (
                <button
                  key={count}
                  onClick={() => addBagWithWeight(count)}
                  disabled={!weightInput || parseFloat(weightInput) <= 0}
                  className="min-h-[60px] px-4 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-transform touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {count} Bag{count > 1 ? 's' : ''}
                </button>
              ))}
            </div>

            {/* Update Bag Button (when editing) */}
            {selectedBagIndex !== null && (
              <button
                onClick={updateSelectedBagWeight}
                className="w-full min-h-[60px] px-4 py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 active:scale-95 transition-transform touch-manipulation mb-4"
              >
                Update Bag {selectedBagIndex + 1}
              </button>
            )}

            {/* Bags List */}
            {bags.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-500">Bags</div>
                {bags.map((bag, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedBagIndex(index)}
                    className={`flex justify-between items-center p-3 rounded-xl cursor-pointer active:scale-[0.98] transition-transform touch-manipulation
                      ${selectedBagIndex === index ? 'bg-amber-100 border-2 border-amber-300' : 'bg-gray-50 border-2 border-transparent'}`}
                  >
                    <div>
                      <span className="font-semibold text-gray-800">Bag {index + 1}</span>
                      <span className="ml-2 text-gray-600">{bag.weight} lbs</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBag(index);
                      }}
                      className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Side - Extras and Options */}
          <div className="flex-1">
            {/* Same Day Toggle */}
            <button
              onClick={() => setIsSameDay(!isSameDay)}
              className={`w-full min-h-[60px] px-4 py-3 font-semibold rounded-xl mb-4 active:scale-95 transition-transform touch-manipulation
                ${isSameDay ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              {isSameDay ? '✓ Same Day Service' : 'Same Day Service'}
              {settings && (
                <div className="text-sm font-normal mt-1">
                  ${(settings.sameDayBasePrice ?? 12).toFixed(2)} up to {settings.sameDayWeightThreshold ?? 7}lbs
                </div>
              )}
            </button>

            {/* Extra Items */}
            {extraItems.length > 0 && (
              <>
                <div className="text-sm font-medium text-gray-500 mb-2">Extra Items</div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {extraItems.map(item => {
                    const isWeightBased = item.perWeightUnit && item.perWeightUnit > 0;
                    const isSelected = selectedExtraItems[item._id] !== undefined;
                    const data = selectedExtraItems[item._id] || { quantity: 0, price: item.price };
                    const itemTotal = isWeightBased && isSelected && totalWeight > 0
                      ? roundToQuarter((totalWeight / item.perWeightUnit!) * data.price)
                      : data.price * data.quantity;

                    return (
                      <div key={item._id} className="space-y-1">
                        <button
                          onClick={() => toggleExtraItem(item)}
                          className={`w-full min-h-[50px] px-3 py-2 text-sm font-semibold rounded-xl active:scale-95 transition-transform touch-manipulation
                            ${isSelected ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                        >
                          {item.name}
                          <div className="text-xs font-normal opacity-80">
                            ${item.price}{isWeightBased ? `/${item.perWeightUnit}lb` : ''}
                          </div>
                        </button>
                        {/* Quantity controls for non-weight-based items */}
                        {isSelected && !isWeightBased && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => adjustItemQuantity(item._id, -1)}
                              className="w-8 h-8 bg-red-100 text-red-600 rounded-lg font-bold"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-semibold">{data.quantity}</span>
                            <button
                              onClick={() => adjustItemQuantity(item._id, 1)}
                              className="w-8 h-8 bg-green-100 text-green-600 rounded-lg font-bold"
                            >
                              +
                            </button>
                          </div>
                        )}
                        {isSelected && (
                          <div className="text-center text-sm text-purple-600 font-medium">
                            ${itemTotal.toFixed(2)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Notes */}
            <div>
              <div className="text-sm font-medium text-gray-500 mb-2">Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions..."
                className="w-full h-20 px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Total Display */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex justify-between items-center">
          <span className="text-lg text-gray-600">Total</span>
          <span className="text-3xl font-bold text-green-600">${totalPrice.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
