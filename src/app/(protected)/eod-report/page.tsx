'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Order } from '@/types';

interface CleaningTask {
  id: string;
  label: string;
  checked: boolean;
}

const DEFAULT_CLEANING_TASKS: CleaningTask[] = [
  { id: 'lints', label: 'Lints cleaned from dryers', checked: false },
  { id: 'trash', label: 'Trash taken out', checked: false },
  { id: 'machines_top', label: 'Top of machines cleaned', checked: false },
  { id: 'floor', label: 'Floor swept', checked: false },
  { id: 'bathroom', label: 'Bathroom cleaned', checked: false },
];

export default function EODReportPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>(DEFAULT_CLEANING_TASKS);
  const [notes, setNotes] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    loadSavedData();
  }, [selectedDate]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/orders', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedData = () => {
    // Load saved cleaning tasks from localStorage for selected date
    const saved = localStorage.getItem(`eod_report_${selectedDate}`);
    if (saved) {
      const data = JSON.parse(saved);
      setCleaningTasks(data.cleaningTasks || DEFAULT_CLEANING_TASKS);
      setNotes(data.notes || '');
    } else {
      // Reset to defaults for new date
      setCleaningTasks(DEFAULT_CLEANING_TASKS);
      setNotes('');
    }
  };

  const saveData = () => {
    localStorage.setItem(`eod_report_${selectedDate}`, JSON.stringify({
      cleaningTasks,
      notes,
    }));
    toast.success('Report saved');
  };

  const toggleTask = (taskId: string) => {
    setCleaningTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, checked: !task.checked } : task
    ));
  };

  // Filter orders by status
  const ordersInCart = orders.filter(o => o.status === 'laid_on_cart' || o.status === 'folding');
  const ordersInDryer = orders.filter(o => o.status === 'in_dryer');
  const ordersInWasher = orders.filter(o => o.status === 'in_washer');
  const ordersToWash = orders.filter(o => o.status === 'new_order' || o.status === 'received' || o.status === 'picked_up');

  const formatPickupTime = (order: Order) => {
    if (!order.estimatedPickupDate) return '';
    const date = new Date(order.estimatedPickupDate);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dayName} ${time}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const copyToClipboard = () => {
    let report = `EOD Report\n${formatDate(selectedDate)}\n\n`;

    if (ordersInCart.length > 0) {
      report += 'IN CARTS:\n';
      ordersInCart.forEach(order => {
        report += `- ${order.customerName} ${order.weight} lbs ${formatPickupTime(order)}\n`;
      });
      report += '\n';
    }

    if (ordersInDryer.length > 0) {
      report += 'IN DRYERS:\n';
      ordersInDryer.forEach(order => {
        report += `- ${order.customerName} ${order.weight} lbs ${formatPickupTime(order)}\n`;
      });
      report += '\n';
    }

    if (ordersInWasher.length > 0) {
      report += 'IN WASHERS:\n';
      ordersInWasher.forEach(order => {
        report += `- ${order.customerName} ${order.weight} lbs ${formatPickupTime(order)}\n`;
      });
      report += '\n';
    }

    if (ordersToWash.length > 0) {
      report += 'Things To Wash:\n';
      report += 'To be washed Monday and up for wash. Loads are already in front of the machines.\n';
      ordersToWash.forEach(order => {
        report += `- ${order.customerName} ${order.weight} lbs\n`;
      });
      report += '\n';
    }

    report += 'Cleaning Duties:\n';
    cleaningTasks.forEach(task => {
      report += `- ${task.label} ${task.checked ? '✓' : '○'}\n`;
    });

    if (notes) {
      report += `\nNotes:\n${notes}\n`;
    }

    navigator.clipboard.writeText(report);
    toast.success('Report copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">EOD Report</h1>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Back
          </button>
        </div>

        {/* Date Picker */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Report Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full md:w-auto px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
          />
          <p className="text-slate-600 mt-2 font-medium">{formatDate(selectedDate)}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* In Carts */}
            <div className="bg-yellow-50 rounded-xl p-4 shadow-sm border border-yellow-200 mb-4">
              <h2 className="text-lg font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 bg-yellow-200 rounded-full flex items-center justify-center text-sm">
                  {ordersInCart.length}
                </span>
                IN CARTS
              </h2>
              {ordersInCart.length === 0 ? (
                <p className="text-yellow-600 text-sm">No orders in carts</p>
              ) : (
                <div className="space-y-2">
                  {ordersInCart.map(order => (
                    <div key={order._id} className="bg-white rounded-lg p-3 border border-yellow-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-800">{order.customerName}</p>
                          <p className="text-sm text-slate-600">{order.weight} lbs</p>
                        </div>
                        <p className="text-sm text-yellow-700 font-medium">{formatPickupTime(order)}</p>
                      </div>
                      {order.specialInstructions && (
                        <p className="text-xs text-slate-500 mt-1 italic">{order.specialInstructions}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* In Dryers */}
            <div className="bg-orange-50 rounded-xl p-4 shadow-sm border border-orange-200 mb-4">
              <h2 className="text-lg font-semibold text-orange-800 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 bg-orange-200 rounded-full flex items-center justify-center text-sm">
                  {ordersInDryer.length}
                </span>
                IN DRYERS
              </h2>
              {ordersInDryer.length === 0 ? (
                <p className="text-orange-600 text-sm">No orders in dryers</p>
              ) : (
                <div className="space-y-2">
                  {ordersInDryer.map(order => (
                    <div key={order._id} className="bg-white rounded-lg p-3 border border-orange-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-800">{order.customerName}</p>
                          <p className="text-sm text-slate-600">{order.weight} lbs</p>
                        </div>
                        <p className="text-sm text-orange-700 font-medium">{formatPickupTime(order)}</p>
                      </div>
                      {order.specialInstructions && (
                        <p className="text-xs text-slate-500 mt-1 italic">{order.specialInstructions}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* In Washers */}
            {ordersInWasher.length > 0 && (
              <div className="bg-cyan-50 rounded-xl p-4 shadow-sm border border-cyan-200 mb-4">
                <h2 className="text-lg font-semibold text-cyan-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 bg-cyan-200 rounded-full flex items-center justify-center text-sm">
                    {ordersInWasher.length}
                  </span>
                  IN WASHERS
                </h2>
                <div className="space-y-2">
                  {ordersInWasher.map(order => (
                    <div key={order._id} className="bg-white rounded-lg p-3 border border-cyan-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-800">{order.customerName}</p>
                          <p className="text-sm text-slate-600">{order.weight} lbs</p>
                        </div>
                        <p className="text-sm text-cyan-700 font-medium">{formatPickupTime(order)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Things to Wash */}
            <div className="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-200 mb-4">
              <h2 className="text-lg font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-sm">
                  {ordersToWash.length}
                </span>
                Things To Wash
              </h2>
              <p className="text-sm text-blue-600 mb-2">
                To be washed tomorrow. Loads are already in front of the machines.
              </p>
              {ordersToWash.length === 0 ? (
                <p className="text-blue-600 text-sm">No pending orders</p>
              ) : (
                <div className="space-y-2">
                  {ordersToWash.map(order => (
                    <div key={order._id} className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-800">{order.customerName}</p>
                          <p className="text-sm text-slate-600">{order.weight} lbs</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          order.status === 'new_order' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'received' ? 'bg-indigo-100 text-indigo-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cleaning Duties */}
            <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-200 mb-4">
              <h2 className="text-lg font-semibold text-green-800 mb-3">Cleaning Duties</h2>
              <div className="space-y-2">
                {cleaningTasks.map(task => (
                  <label
                    key={task.id}
                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-green-200 cursor-pointer hover:bg-green-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={task.checked}
                      onChange={() => toggleTask(task.id)}
                      className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className={`flex-1 ${task.checked ? 'text-green-700 line-through' : 'text-slate-700'}`}>
                      {task.label}
                    </span>
                    {task.checked && (
                      <span className="text-green-600 text-lg">✓</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 mb-4">
              <h2 className="text-lg font-semibold text-slate-700 mb-3">Notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes for tomorrow..."
                className="w-full p-3 border border-slate-200 rounded-lg resize-y min-h-[100px] focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={saveData}
                className="flex-1 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
              >
                Save Report
              </button>
              <button
                onClick={copyToClipboard}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Copy to Clipboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
