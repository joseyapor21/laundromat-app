'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Customer } from '@/types';
import toast from 'react-hot-toast';

interface POSCustomerPanelProps {
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
}

const RECENT_CUSTOMERS_KEY = 'pos_recent_customers';
const MAX_RECENT = 5;

export default function POSCustomerPanel({ selectedCustomer, onSelectCustomer }: POSCustomerPanelProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  // Load recent customers from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_CUSTOMERS_KEY);
      if (stored) {
        setRecentCustomers(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load recent customers:', e);
    }
  }, []);

  // Save customer to recent list
  const addToRecent = useCallback((customer: Customer) => {
    setRecentCustomers(prev => {
      const filtered = prev.filter(c => c._id !== customer._id);
      const updated = [customer, ...filtered].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_CUSTOMERS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save recent customers:', e);
      }
      return updated;
    });
  }, []);

  // Search customers
  const searchCustomers = useCallback(async () => {
    if (!search || search.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/customers/search?q=${encodeURIComponent(search)}`);
      if (response.ok) {
        setResults(await response.json());
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [search]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(searchCustomers, 300);
    return () => clearTimeout(timer);
  }, [search, searchCustomers]);

  // Select customer
  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer);
    addToRecent(customer);
    setSearch('');
    setResults([]);
  };

  // Clear selection
  const handleClear = () => {
    onSelectCustomer(null);
  };

  // Create new customer
  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
      toast.error('Name and phone required');
      return;
    }

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustomerName.trim(),
          phoneNumber: newCustomerPhone.trim(),
          address: '',
          buzzerCode: '',
          deliveryFee: '$03.00',
          notes: '',
        }),
      });

      if (!response.ok) throw new Error('Failed to create customer');

      const customer = await response.json();
      toast.success('Customer created!');
      handleSelect(customer);
      setShowNewCustomerForm(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
    } catch (error) {
      toast.error('Failed to create customer');
    }
  };

  return (
    <div className="w-[280px] bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">Customer</h2>
      </div>

      {/* Search */}
      <div className="p-3">
        <input
          type="text"
          placeholder="Search name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-14 px-4 text-lg border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none touch-manipulation"
        />
      </div>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="px-3 pb-3 max-h-48 overflow-y-auto">
          {results.map(customer => (
            <button
              key={customer._id}
              onClick={() => handleSelect(customer)}
              className="w-full p-3 mb-2 text-left bg-gray-50 rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-transform touch-manipulation"
            >
              <div className="font-semibold text-gray-800">{customer.name}</div>
              <div className="text-sm text-gray-500">{customer.phoneNumber}</div>
              {(customer.credit || 0) > 0 && (
                <span className="text-xs text-green-600 font-medium">
                  ${(customer.credit || 0).toFixed(2)} credit
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isSearching && (
        <div className="px-3 pb-3 text-gray-500 text-sm">Searching...</div>
      )}

      {/* Selected Customer */}
      {selectedCustomer && (
        <div className="p-3 mx-3 mb-3 bg-blue-50 border-2 border-blue-200 rounded-xl">
          <div className="flex justify-between items-start mb-2">
            <div className="font-bold text-blue-800 text-lg">{selectedCustomer.name}</div>
            <button
              onClick={handleClear}
              className="text-blue-500 hover:text-blue-700 text-xl leading-none"
            >
              &times;
            </button>
          </div>
          <div className="text-blue-600">{selectedCustomer.phoneNumber}</div>
          {(selectedCustomer.credit || 0) > 0 && (
            <div className="mt-2 px-3 py-2 bg-green-100 rounded-lg">
              <span className="text-green-700 font-semibold">
                Credit: ${(selectedCustomer.credit || 0).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recent Customers */}
      {!selectedCustomer && recentCustomers.length > 0 && !search && (
        <div className="flex-1 overflow-y-auto px-3">
          <div className="text-sm font-medium text-gray-500 mb-2">Recent</div>
          {recentCustomers.map(customer => (
            <button
              key={customer._id}
              onClick={() => handleSelect(customer)}
              className="w-full min-h-[60px] p-3 mb-2 text-left bg-gray-50 rounded-xl hover:bg-blue-50 active:scale-[0.98] transition-transform touch-manipulation"
            >
              <div className="font-semibold text-gray-800">{customer.name}</div>
              <div className="text-sm text-gray-500">{customer.phoneNumber}</div>
            </button>
          ))}
        </div>
      )}

      {/* New Customer Button/Form */}
      <div className="p-3 mt-auto border-t border-gray-200">
        {!showNewCustomerForm ? (
          <button
            onClick={() => setShowNewCustomerForm(true)}
            className="w-full min-h-[60px] px-4 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-transform touch-manipulation"
          >
            + New Customer
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Name"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              className="w-full h-12 px-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
              className="w-full h-12 px-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewCustomerForm(false)}
                className="flex-1 h-12 px-3 bg-gray-200 text-gray-700 font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomer}
                className="flex-1 h-12 px-3 bg-emerald-600 text-white font-semibold rounded-lg"
              >
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
