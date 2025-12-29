'use client';

import { useState, useEffect, useCallback } from 'react';
import { Order, OrderStatus, MachineAssignment, PaymentMethod } from '@/types';
import QRScanner from '@/components/scanner/QRScanner';
import EditOrderModal from '@/components/orders/EditOrderModal';
import toast from 'react-hot-toast';
import { printerService } from '@/services/printerService';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'zelle', label: 'Zelle' },
];

interface CurrentUser {
  userId: string;
  name: string;
  role: string;
}

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onUpdate: () => void;
  currentUser?: CurrentUser | null;
}

const STATUS_OPTIONS: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'new_order', label: 'New Order', color: 'bg-blue-500' },
  { value: 'received', label: 'Received', color: 'bg-indigo-500' },
  { value: 'scheduled_pickup', label: 'Scheduled Pickup', color: 'bg-purple-500' },
  { value: 'picked_up', label: 'Picked Up', color: 'bg-violet-500' },
  { value: 'in_washer', label: 'In Washer', color: 'bg-cyan-500' },
  { value: 'in_dryer', label: 'In Dryer', color: 'bg-orange-500' },
  { value: 'laid_on_cart', label: 'On Cart', color: 'bg-yellow-500' },
  { value: 'folding', label: 'Folding', color: 'bg-pink-500' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup', color: 'bg-green-500' },
  { value: 'ready_for_delivery', label: 'Ready for Delivery', color: 'bg-emerald-500' },
  { value: 'completed', label: 'Completed', color: 'bg-gray-500' },
];

// Helper to safely format dates
const formatDate = (date: Date | string | undefined | null): string => {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return '';
  }
};

export default function OrderDetailModal({ order, onClose, onUpdate, currentUser }: OrderDetailModalProps) {
  const [currentOrder, setCurrentOrder] = useState<Order>(order);
  const [isScanning, setIsScanning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>(
    order.paymentMethod || 'cash'
  );
  const [checkingMachine, setCheckingMachine] = useState<string | null>(null);
  const [uncheckingMachine, setUncheckingMachine] = useState<string | null>(null);

  // Refresh order data
  const refreshOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${order._id}`);
      if (response.ok) {
        const updatedOrder = await response.json();
        console.log('Refreshed order:', {
          orderId: updatedOrder.orderId,
          machineAssignments: updatedOrder.machineAssignments,
        });
        setCurrentOrder(updatedOrder);
      }
    } catch (error) {
      console.error('Failed to refresh order:', error);
    }
  }, [order._id]);

  // Refresh order data when modal opens
  useEffect(() => {
    refreshOrder();
  }, [refreshOrder]);

  // Print order receipts only (customer receipt + store copy) - NO bag labels
  const handlePrintOrder = async () => {
    setPrinting(true);
    try {
      await printerService.printOrderReceipts(currentOrder);
      toast.success('Order receipts printed (Customer + Store copy)');
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print order receipts');
    } finally {
      setPrinting(false);
    }
  };

  // Print bag labels
  const handlePrintLabel = async (bagIndex?: number) => {
    setPrinting(true);
    try {
      if (bagIndex !== undefined) {
        // Print specific bag label
        await printerService.printSingleBagLabel(currentOrder, bagIndex);
        toast.success(`Bag ${bagIndex + 1} label printed!`);
      } else {
        // Print all bag labels
        await printerService.printBagLabels(currentOrder);
        toast.success(`${currentOrder.bags?.length || 0} bag labels printed!`);
      }
    } catch (error) {
      console.error('Print error:', error);
      toast.error('Failed to print labels');
    } finally {
      setPrinting(false);
    }
  };

  // Update order status
  const handleStatusChange = async (newStatus: OrderStatus) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/orders/${order._id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error('Failed to update status');

      toast.success(`Status updated to ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label}`);
      await refreshOrder();
      onUpdate();
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  // Handle QR scan result
  const handleScan = async (qrCode: string) => {
    setIsScanning(false);
    setLoading(true);

    console.log('Scanning QR code:', qrCode, 'for order:', order._id);

    try {
      const response = await fetch('/api/machines/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode,
          orderId: order._id,
        }),
      });

      const data = await response.json();
      console.log('Scan response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign machine');
      }

      toast.success(data.message);
      await refreshOrder();
      onUpdate();
    } catch (error) {
      console.error('Scan error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to scan');
    } finally {
      setLoading(false);
    }
  };

  // Mark order as paid with payment method
  const handlePaymentToggle = async () => {
    setLoading(true);
    try {
      const updateData = currentOrder.isPaid
        ? { isPaid: false, paymentMethod: null }
        : { isPaid: true, paymentMethod: selectedPaymentMethod };

      const response = await fetch(`/api/orders/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error('Failed to update payment status');

      toast.success(currentOrder.isPaid ? 'Payment status cleared' : `Order marked as paid (${selectedPaymentMethod})`);
      await refreshOrder();
      onUpdate();
    } catch (error) {
      toast.error('Failed to update payment status');
    } finally {
      setLoading(false);
    }
  };

  // Release order from machine
  const handleReleaseMachine = async (machineId: string, machineName: string) => {
    if (!confirm(`Remove order from ${machineName}?`)) return;

    setLoading(true);
    try {
      const response = await fetch('/api/machines/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId,
          orderId: order._id,
        }),
      });

      if (!response.ok) throw new Error('Failed to release machine');

      toast.success(`Order removed from ${machineName}`);
      await refreshOrder();
      onUpdate();
    } catch (error) {
      toast.error('Failed to release machine');
    } finally {
      setLoading(false);
    }
  };

  // Check machine assignment (verify work done by another person)
  const handleCheckMachine = async (machineId: string, machineName: string, machineType: string) => {
    console.log('handleCheckMachine called:', { machineId, machineName, machineType, orderId: order._id });

    if (!currentUser) {
      toast.error('You must be logged in to check machines');
      return;
    }

    if (!order._id || !machineId) {
      console.error('Missing data:', { orderId: order._id, machineId });
      toast.error('Missing order or machine data. Please refresh and try again.');
      return;
    }

    // Get initials from user's name (first letter of each word)
    const initials = currentUser.name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 3);

    setCheckingMachine(machineId);
    try {
      const requestBody = {
        orderId: order._id,
        machineId,
        checkerInitials: initials,
      };
      console.log('Sending check request:', requestBody);

      const response = await fetch('/api/machines/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check machine');
      }

      toast.success(`${machineType === 'washer' ? 'Washer' : 'Dryer'} "${machineName}" checked by ${currentUser.name}!`);
      await refreshOrder();
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check machine');
    } finally {
      setCheckingMachine(null);
    }
  };

  // Uncheck machine assignment (allow someone else to check)
  const handleUncheckMachine = async (machineId: string, machineName: string, machineType: string) => {
    setUncheckingMachine(machineId);
    try {
      const response = await fetch('/api/machines/uncheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order._id,
          machineId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to uncheck machine');
      }

      toast.success(`${machineType === 'washer' ? 'Washer' : 'Dryer'} "${machineName}" unchecked`);
      await refreshOrder();
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to uncheck machine');
    } finally {
      setUncheckingMachine(null);
    }
  };

  // Get active machine assignments (not removed and not yet checked)
  const activeMachines = currentOrder.machineAssignments?.filter(
    (a: MachineAssignment) => !a.removedAt
  ) || [];

  // Get all machine assignments for history
  const allMachineAssignments = currentOrder.machineAssignments || [];

  const currentStatusOption = STATUS_OPTIONS.find(s => s.value === currentOrder.status);

  return (
    <>
      {/* QR Scanner Overlay */}
      <QRScanner
        isScanning={isScanning}
        onScan={handleScan}
        onClose={() => setIsScanning(false)}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40"
        onClick={onClose}
      >
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Order #{currentOrder.orderId}
              </h2>
              <p className="text-sm text-gray-600">{currentOrder.customerName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg text-gray-500"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 1. Customer Info */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Customer</h3>
              <p className="text-gray-900 font-medium text-lg">{currentOrder.customerName}</p>
              <a href={`tel:${currentOrder.customerPhone}`} className="text-blue-600 text-sm flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {currentOrder.customerPhone}
              </a>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  currentOrder.orderType === 'delivery'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {currentOrder.orderType === 'delivery' ? 'Delivery' : 'In-Store Pickup'}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${currentStatusOption?.color} text-white`}>
                  {currentStatusOption?.label}
                </span>
              </div>
            </div>

            {/* 2. Print Actions */}
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <h3 className="text-sm font-semibold text-blue-800 mb-3">Print Labels</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handlePrintOrder}
                  disabled={printing}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  {printing ? 'Printing...' : 'Print Order'}
                </button>
                <button
                  onClick={() => handlePrintLabel()}
                  disabled={printing || !currentOrder.bags?.length}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  {printing ? 'Printing...' : 'All Bag Labels'}
                </button>
              </div>
              {currentOrder.bags && currentOrder.bags.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs text-blue-600 mb-2">Print individual bags:</p>
                  <div className="flex flex-wrap gap-2">
                    {currentOrder.bags.map((bag, index) => (
                      <button
                        key={index}
                        onClick={() => handlePrintLabel(index)}
                        disabled={printing}
                        className="px-3 py-1.5 text-sm bg-white hover:bg-blue-100 disabled:bg-gray-100 text-blue-700 rounded-lg font-medium transition-colors border border-blue-200"
                      >
                        Bag {bag.identifier || index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Machine Assignments (Scan Washer/Dryer) */}
            <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-cyan-800">Washer / Dryer</h3>
                <button
                  onClick={() => setIsScanning(true)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  Scan QR
                </button>
              </div>

              {activeMachines.length === 0 ? (
                <p className="text-cyan-600 text-sm py-2">No machines assigned. Tap "Scan QR" to add.</p>
              ) : (
                <div className="space-y-2">
                  {activeMachines.map((assignment: MachineAssignment, index: number) => (
                    <div
                      key={index}
                      className={`bg-white rounded-lg p-3 border ${
                        assignment.isChecked ? 'border-green-300 bg-green-50' : 'border-cyan-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            assignment.isChecked
                              ? 'bg-green-100 text-green-600'
                              : assignment.machineType === 'washer'
                                ? 'bg-cyan-100 text-cyan-600'
                                : 'bg-orange-100 text-orange-600'
                          }`}>
                            {assignment.isChecked ? (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : assignment.machineType === 'washer' ? (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{assignment.machineName}</p>
                            <p className="text-xs text-gray-500 capitalize">
                              {assignment.machineType}
                              {assignment.isChecked && (
                                <span className="ml-1 text-green-600">
                                  - Checked by {assignment.checkedByInitials}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        {!assignment.isChecked && (
                          <button
                            onClick={() => handleReleaseMachine(assignment.machineId, assignment.machineName)}
                            disabled={loading}
                            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {/* Checker section */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {!assignment.isChecked ? (
                          <>
                            <p className="text-xs text-gray-600 mb-2">
                              When done, another person must verify:
                            </p>
                            <button
                              onClick={() => handleCheckMachine(
                                assignment.machineId,
                                assignment.machineName,
                                assignment.machineType
                              )}
                              disabled={checkingMachine === assignment.machineId}
                              className="w-full px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                            >
                              {checkingMachine === assignment.machineId
                                ? 'Checking...'
                                : `Check as ${currentUser?.name || 'User'}`}
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-green-700">
                              <span className="font-medium">Checked by:</span> {assignment.checkedBy || 'Unknown'}
                              {assignment.checkedByInitials && ` (${assignment.checkedByInitials})`}
                              {formatDate(assignment.checkedAt) && (
                                <span className="text-gray-500 ml-1">
                                  ({formatDate(assignment.checkedAt)})
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleUncheckMachine(
                                assignment.machineId,
                                assignment.machineName,
                                assignment.machineType
                              )}
                              disabled={uncheckingMachine === assignment.machineId}
                              className="px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded disabled:opacity-50"
                            >
                              {uncheckingMachine === assignment.machineId ? 'Unchecking...' : 'Uncheck'}
                            </button>
                          </div>
                        )}
                      </div>

                      {(assignment.assignedBy || assignment.assignedAt) && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-500">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>
                            {assignment.assignedBy && `Added by ${assignment.assignedBy}`}
                            {assignment.assignedBy && assignment.assignedAt && ': '}
                            {formatDate(assignment.assignedAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Machine History */}
            {allMachineAssignments.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Machine History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {allMachineAssignments
                    .sort((a: MachineAssignment, b: MachineAssignment) =>
                      new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
                    )
                    .map((assignment: MachineAssignment, index: number) => (
                    <div
                      key={index}
                      className={`text-xs p-2 rounded ${
                        assignment.removedAt
                          ? 'bg-gray-100 text-gray-500'
                          : assignment.isChecked
                            ? 'bg-green-50 border border-green-200 text-gray-700'
                            : 'bg-white border border-gray-200 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {assignment.machineType === 'washer' ? '🧺' : '🔥'} {assignment.machineName}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          assignment.removedAt
                            ? 'bg-gray-200'
                            : assignment.isChecked
                              ? 'bg-green-200 text-green-800'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {assignment.removedAt ? 'Done' : assignment.isChecked ? 'Checked' : 'Pending Check'}
                        </span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {(assignment.assignedBy || assignment.assignedAt) && (
                          <div className="text-gray-600">
                            <span className="text-blue-600 font-medium">Assigned by:</span> {assignment.assignedBy || 'Unknown'}
                            {formatDate(assignment.assignedAt) && ` - ${formatDate(assignment.assignedAt)}`}
                          </div>
                        )}
                        {assignment.isChecked && assignment.checkedBy && (
                          <div className="text-gray-600">
                            <span className="text-green-600 font-medium">Checked by:</span> {assignment.checkedBy}
                            {assignment.checkedByInitials && ` (${assignment.checkedByInitials})`}
                            {formatDate(assignment.checkedAt) && ` - ${formatDate(assignment.checkedAt)}`}
                          </div>
                        )}
                        {assignment.removedAt && formatDate(assignment.removedAt) && (
                          <div className="text-gray-600">
                            <span className="text-red-500 font-medium">Removed:</span> {formatDate(assignment.removedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Update Status */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Process Status</h3>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleStatusChange(option.value)}
                    disabled={loading || currentOrder.status === option.value}
                    className={`px-3 py-2.5 text-sm rounded-lg font-medium transition-all ${
                      currentOrder.status === option.value
                        ? `${option.color} text-white`
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    } disabled:opacity-50`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 6. Order Details */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Order Details</h3>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-white p-2 rounded-lg text-center border border-gray-200">
                  <span className="text-gray-500 text-xs block">Weight</span>
                  <span className="text-gray-900 font-bold">{currentOrder.weight} lbs</span>
                </div>
                <div className="bg-white p-2 rounded-lg text-center border border-gray-200">
                  <span className="text-gray-500 text-xs block">Bags</span>
                  <span className="text-gray-900 font-bold">{currentOrder.bags?.length || 0}</span>
                </div>
                <div className="bg-white p-2 rounded-lg text-center border border-gray-200">
                  <span className="text-gray-500 text-xs block">Total</span>
                  <span className="text-gray-900 font-bold">${currentOrder.totalAmount?.toFixed(2)}</span>
                </div>
              </div>

              {/* Dates */}
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
                {currentOrder.dropOffDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Drop-off:</span>
                    <span className="text-gray-900 font-medium">
                      {new Date(currentOrder.dropOffDate).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {currentOrder.estimatedPickupDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      {currentOrder.orderType === 'delivery' ? 'Pickup:' : 'Ready by:'}
                    </span>
                    <span className="text-gray-900 font-medium">
                      {new Date(currentOrder.estimatedPickupDate).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
                {currentOrder.orderType === 'delivery' && currentOrder.deliverySchedule && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Delivery:</span>
                    <span className="text-gray-900 font-medium">
                      {new Date(currentOrder.deliverySchedule).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })}
                    </span>
                  </div>
                )}
              </div>

              {currentOrder.specialInstructions && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-gray-500 text-xs">Notes:</span>
                  <p className="text-gray-900 text-sm mt-1 bg-yellow-50 p-2 rounded border border-yellow-200">{currentOrder.specialInstructions}</p>
                </div>
              )}
            </div>

            {/* 7. Payment (Last) */}
            <div className={`rounded-lg p-3 border ${
              currentOrder.isPaid
                ? 'bg-green-50 border-green-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <h3 className={`text-sm font-semibold mb-2 ${
                currentOrder.isPaid ? 'text-green-800' : 'text-yellow-800'
              }`}>Payment</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {currentOrder.isPaid ? (
                    <span className="px-3 py-1.5 bg-green-600 text-white rounded-full text-sm font-medium">
                      Paid ({currentOrder.paymentMethod || 'cash'})
                    </span>
                  ) : (
                    <>
                      <select
                        value={selectedPaymentMethod}
                        onChange={(e) => setSelectedPaymentMethod(e.target.value as PaymentMethod)}
                        className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white"
                      >
                        {PAYMENT_METHODS.map(method => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
                <button
                  onClick={handlePaymentToggle}
                  disabled={loading}
                  className={`px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 ${
                    currentOrder.isPaid
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {currentOrder.isPaid ? 'Mark Unpaid' : 'Mark Paid'}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Edit Order
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Edit Order Modal */}
      {isEditing && (
        <EditOrderModal
          order={currentOrder}
          onClose={() => setIsEditing(false)}
          onSuccess={() => {
            setIsEditing(false);
            refreshOrder();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
