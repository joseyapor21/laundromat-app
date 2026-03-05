import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { localPrinter } from '../services/LocalPrinter';
import { useLocation } from '../contexts/LocationContext';
import type { Order, PaymentMethod, Settings } from '../types';

// ESC/POS commands for thermal printer
const ESC = {
  INIT: '\x1B\x40',
  INVERT_ON: '\x1D\x42\x01',
  INVERT_OFF: '\x1D\x42\x00',
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  DOUBLE_HEIGHT_ON: '\x1B\x21\x10',
  DOUBLE_SIZE_ON: '\x1B\x21\x30',
  NORMAL_SIZE: '\x1B\x21\x00',
  CENTER: '\x1B\x61\x01',
  LEFT: '\x1B\x61\x00',
  FEED_AND_CUT: '\n\n\n\n\n\x1D\x56\x41\x03',
};

// Display payment methods (credit is counted as cash)
type DisplayPaymentMethod = 'cash' | 'check' | 'venmo' | 'zelle';
const PAYMENT_METHODS: { key: DisplayPaymentMethod; label: string; color: string }[] = [
  { key: 'cash', label: 'Cash', color: '#10b981' },
  { key: 'check', label: 'Check', color: '#3b82f6' },
  { key: 'venmo', label: 'Venmo', color: '#8b5cf6' },
  { key: 'zelle', label: 'Zelle', color: '#f59e0b' },
];

interface CreditTransaction {
  customerId: string;
  customerName: string;
  amount: number;
  description: string;
  paymentMethod: string;
  addedBy: string;
  createdAt: string;
}

export default function CashierReportScreen() {
  const { currentLocation } = useLocation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [settings, setSettings] = useState<Settings | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      // Format date as YYYY-MM-DD for API
      const dateStr = selectedDate.toISOString().split('T')[0];

      const [allOrders, settingsData, creditData] = await Promise.all([
        api.getOrders(),
        api.getSettings(),
        api.getCreditTransactions(dateStr, currentLocation?._id),
      ]);
      setOrders(allOrders);
      setSettings(settingsData);
      setCreditTransactions(creditData.transactions || []);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, currentLocation?._id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  // Filter orders by paidAt date (when payment was collected)
  // Separate cash/check/etc orders (count as income) from credit orders (don't count - already collected)
  const allPaidOrdersToday = orders.filter(order => {
    if (!order.isPaid || !order.paidAt) return false;
    const paidDate = new Date(order.paidAt);
    return (
      paidDate.getFullYear() === selectedDate.getFullYear() &&
      paidDate.getMonth() === selectedDate.getMonth() &&
      paidDate.getDate() === selectedDate.getDate()
    );
  });

  // Orders paid with cash/check/venmo/zelle - these count as income
  const paidOrdersToday = allPaidOrdersToday.filter(o => o.paymentMethod !== 'credit');

  // Orders paid with credit - show but don't count as income (money was collected when credit was added)
  const creditPaidOrdersToday = allPaidOrdersToday.filter(o => o.paymentMethod === 'credit');

  // Calculate totals by payment method
  const getDisplayMethod = (paymentMethod: PaymentMethod | undefined): DisplayPaymentMethod => {
    if (!paymentMethod || !['cash', 'check', 'venmo', 'zelle'].includes(paymentMethod)) return 'cash';
    return paymentMethod as DisplayPaymentMethod;
  };

  // Calculate order totals by payment method
  const orderTotalsByMethod = PAYMENT_METHODS.map(method => {
    const methodOrders = paidOrdersToday.filter(o => getDisplayMethod(o.paymentMethod) === method.key);
    const total = methodOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    return {
      ...method,
      orderCount: methodOrders.length,
      orderTotal: total,
    };
  });

  // Calculate credit addition totals by payment method
  const creditTotalsByMethod = PAYMENT_METHODS.map(method => {
    const methodCredits = creditTransactions.filter(tx => (tx.paymentMethod || 'cash') === method.key);
    const total = methodCredits.reduce((sum, tx) => sum + tx.amount, 0);
    return {
      key: method.key,
      creditCount: methodCredits.length,
      creditTotal: total,
    };
  });

  // Combine totals
  const totalsByMethod = PAYMENT_METHODS.map(method => {
    const orderData = orderTotalsByMethod.find(o => o.key === method.key) || { orderCount: 0, orderTotal: 0 };
    const creditData = creditTotalsByMethod.find(c => c.key === method.key) || { creditCount: 0, creditTotal: 0 };
    return {
      ...method,
      count: orderData.orderCount + creditData.creditCount,
      total: orderData.orderTotal + creditData.creditTotal,
      orderCount: orderData.orderCount,
      orderTotal: orderData.orderTotal,
      creditCount: creditData.creditCount,
      creditTotal: creditData.creditTotal,
    };
  });

  const grandTotal = totalsByMethod.reduce((sum, m) => sum + m.total, 0);
  const totalOrderCount = paidOrdersToday.length;
  const totalCreditCount = creditTransactions.length;
  const creditPaidTotal = creditPaidOrdersToday.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  // Date navigation
  const goToPreviousDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    setSelectedDate(prev);
  };

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const formatDate = (date: Date) => {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    const year = date.getFullYear();
    return `${weekday}, ${month} ${day}, ${year}`;
  };

  const isToday = () => {
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  };

  // Format time to ASCII-safe string (avoid Unicode AM/PM)
  const formatTimeASCII = (date: Date): string => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
    return `${hours}:${minutesStr} ${ampm}`;
  };

  // Format date and time to ASCII-safe string
  const formatDateTimeASCII = (date: Date): string => {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year} ${formatTimeASCII(date)}`;
  };

  // Helper for thermal print alignment
  const leftRightAlign = (left: string, right: string): string => {
    const maxWidth = 48;
    const totalContentLength = left.length + right.length;
    if (totalContentLength >= maxWidth) {
      return `${left} ${right}`;
    }
    const padding = maxWidth - totalContentLength;
    return left + ' '.repeat(padding) + right;
  };

  // Print to thermal printer
  const handlePrint = async () => {
    const printerIp = settings?.thermalPrinterIp;
    const printerPort = settings?.thermalPrinterPort || 9100;

    if (!printerIp) {
      Alert.alert('Printer Not Configured', 'Please set the thermal printer IP in Admin Settings.');
      return;
    }

    setPrinting(true);
    try {
      const dateStr = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      let r = '';
      r += ESC.INIT;
      r += ESC.CENTER;

      // Store Info
      r += ESC.BOLD_ON;
      r += `${currentLocation?.name || 'Store'}\n`;
      r += ESC.BOLD_OFF;
      if (currentLocation?.address) {
        r += `${currentLocation.address}\n`;
      }
      if (currentLocation?.phone) {
        r += `Tel: ${currentLocation.phone}\n`;
      }
      r += '\n';

      // Header
      r += ESC.DOUBLE_SIZE_ON;
      r += ESC.INVERT_ON;
      r += ' CASHIER REPORT \n';
      r += ESC.INVERT_OFF;
      r += ESC.NORMAL_SIZE;
      r += '\n';

      r += ESC.DOUBLE_HEIGHT_ON;
      r += `${dateStr}\n`;
      r += ESC.NORMAL_SIZE;
      r += '================================================\n';

      // Summary by payment method
      r += ESC.LEFT;
      r += ESC.BOLD_ON;
      r += 'PAYMENT SUMMARY\n';
      r += ESC.BOLD_OFF;
      r += '------------------------------------------------\n';

      totalsByMethod.forEach(method => {
        r += leftRightAlign(`${method.label} (${method.count})`, `$${method.total.toFixed(2)}`) + '\n';
        if (method.orderCount > 0 && method.creditCount > 0) {
          r += `  ${method.orderCount} orders + ${method.creditCount} credit\n`;
        }
      });

      r += '================================================\n';
      r += ESC.DOUBLE_HEIGHT_ON;
      r += ESC.BOLD_ON;
      r += leftRightAlign('TOTAL', `$${grandTotal.toFixed(2)}`) + '\n';
      r += leftRightAlign('Items', `${totalOrderCount} orders + ${totalCreditCount} credit`) + '\n';
      r += ESC.BOLD_OFF;
      r += ESC.NORMAL_SIZE;
      r += '================================================\n';

      // Individual orders
      r += '\n';
      r += ESC.CENTER;
      r += ESC.BOLD_ON;
      r += 'ORDER DETAILS\n';
      r += ESC.BOLD_OFF;
      r += ESC.LEFT;
      r += '------------------------------------------------\n';

      paidOrdersToday.forEach(order => {
        const method = order.paymentMethod?.toUpperCase() || 'CASH';
        const weightStr = order.weight ? `${order.weight} lbs` : '';
        r += leftRightAlign(`#${order.orderId} ${order.customerName?.substring(0, 18) || ''}`, `$${order.totalAmount.toFixed(2)}`) + '\n';
        r += `  ${method}${weightStr ? ` - ${weightStr}` : ''}\n`;
      });

      // Credit deposits
      if (creditTransactions.length > 0) {
        r += '\n';
        r += ESC.CENTER;
        r += ESC.BOLD_ON;
        r += 'CREDIT DEPOSITS\n';
        r += ESC.BOLD_OFF;
        r += ESC.LEFT;
        r += '------------------------------------------------\n';

        creditTransactions.forEach(tx => {
          const method = (tx.paymentMethod || 'cash').toUpperCase();
          r += leftRightAlign(`${tx.customerName.substring(0, 20)}`, `+$${tx.amount.toFixed(2)}`) + '\n';
          r += `  ${method} - ${tx.description.substring(0, 30)}\n`;
        });
      }

      // Credit-paid orders (not in revenue)
      if (creditPaidOrdersToday.length > 0) {
        r += '\n';
        r += ESC.CENTER;
        r += ESC.BOLD_ON;
        r += 'PAID WITH CREDIT\n';
        r += ESC.BOLD_OFF;
        r += '(Not in revenue - already collected)\n';
        r += ESC.LEFT;
        r += '------------------------------------------------\n';

        creditPaidOrdersToday.forEach(order => {
          r += leftRightAlign(`#${order.orderId} ${order.customerName?.substring(0, 18) || ''}`, `$${order.totalAmount.toFixed(2)}`) + '\n';
        });
        r += leftRightAlign('Credit payments total:', `$${creditPaidTotal.toFixed(2)}`) + '\n';
      }

      r += '================================================\n';
      r += ESC.CENTER;
      r += `Printed: ${formatDateTimeASCII(new Date())}\n`;
      r += '\n';
      r += ESC.FEED_AND_CUT;

      // Send to local printer via TCP
      const result = await localPrinter.printReceipt(printerIp, r, printerPort);
      if (result.success) {
        Alert.alert('Success', 'Report printed successfully');
      } else {
        throw new Error(result.error || 'Print failed');
      }
    } catch (error) {
      console.error('Print error:', error);
      Alert.alert('Error', 'Failed to print report');
    } finally {
      setPrinting(false);
    }
  };

  // Share report
  const handleShare = async () => {
    let summaryLines = totalsByMethod.map(m => {
      let line = `${m.label}: ${m.count} items - $${m.total.toFixed(2)}`;
      if (m.orderCount > 0 && m.creditCount > 0) {
        line += `\n  (${m.orderCount} orders + ${m.creditCount} credit deposits)`;
      }
      return line;
    }).join('\n');

    // Build store header
    let storeHeader = '';
    if (currentLocation) {
      storeHeader = `${currentLocation.name}\n`;
      if (currentLocation.address) storeHeader += `${currentLocation.address}\n`;
      if (currentLocation.phone) storeHeader += `Tel: ${currentLocation.phone}\n`;
      storeHeader += '----------------------------------------\n';
    }

    // Credit deposits section
    const creditSection = creditTransactions.length > 0
      ? `\nCREDIT DEPOSITS
${creditTransactions.map(tx => {
  const method = (tx.paymentMethod || 'cash').toUpperCase();
  return `${tx.customerName} - +$${tx.amount.toFixed(2)} (${method})`;
}).join('\n')}

----------------------------------------`
      : '';

    // Credit-paid orders section
    const creditPaidSection = creditPaidOrdersToday.length > 0
      ? `\nPAID WITH CREDIT (Not in revenue - already collected)
${creditPaidOrdersToday.map(o => {
  return `#${o.orderId} ${o.customerName} - $${o.totalAmount.toFixed(2)}`;
}).join('\n')}
Credit payments total: $${creditPaidTotal.toFixed(2)}

----------------------------------------`
      : '';

    const report = `${storeHeader}CASHIER REPORT
${formatDate(selectedDate)}
----------------------------------------

PAYMENT SUMMARY
${summaryLines}

----------------------------------------
TOTAL: $${grandTotal.toFixed(2)}
Items: ${totalOrderCount} orders + ${totalCreditCount} credit deposits
----------------------------------------

ORDER DETAILS
${paidOrdersToday.map(o => {
  const method = o.paymentMethod?.toUpperCase() || 'CASH';
  return `#${o.orderId} ${o.customerName} - $${o.totalAmount.toFixed(2)} (${method})`;
}).join('\n')}${creditSection}${creditPaidSection}

Generated: ${formatDateTimeASCII(new Date())}`.trim();

    try {
      await Share.share({
        message: report,
        title: `Cashier Report - ${formatDate(selectedDate)}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          {currentLocation && (
            <Text style={styles.storeName}>{currentLocation.name}</Text>
          )}
          <Text style={styles.headerTitle}>Cashier Report</Text>
        </View>

        {/* Date Selector */}
        <View style={styles.dateSelector}>
          <TouchableOpacity style={styles.dateArrow} onPress={goToPreviousDay}>
            <Ionicons name="chevron-back" size={24} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToToday}>
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            {!isToday() && (
              <Text style={styles.todayLink}>Tap for today</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateArrow} onPress={goToNextDay}>
            <Ionicons name="chevron-forward" size={24} color="#2563eb" />
          </TouchableOpacity>
        </View>

        {/* Summary Cards */}
        <View style={styles.summarySection}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Revenue</Text>
            <Text style={styles.totalAmount}>${grandTotal.toFixed(2)}</Text>
            <Text style={styles.totalOrders}>
              {totalOrderCount} orders + {totalCreditCount} credit deposits
            </Text>
          </View>
        </View>

        {/* Payment Method Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Payment Method</Text>
          {totalsByMethod.map(method => (
            <View key={method.key} style={styles.methodCard}>
              <View style={styles.methodInfo}>
                <View style={[styles.methodDot, { backgroundColor: method.color }]} />
                <View>
                  <Text style={styles.methodLabel}>{method.label}</Text>
                  {(method.orderCount > 0 || method.creditCount > 0) && (
                    <Text style={styles.creditNote}>
                      {method.orderCount > 0 && `${method.orderCount} orders`}
                      {method.orderCount > 0 && method.creditCount > 0 && ' + '}
                      {method.creditCount > 0 && `${method.creditCount} credit`}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.methodStats}>
                <Text style={styles.methodCount}>{method.count} items</Text>
                <Text style={styles.methodTotal}>${method.total.toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Order List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paid Orders ({paidOrdersToday.length})</Text>
          {paidOrdersToday.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No paid orders for this date</Text>
            </View>
          ) : (
            paidOrdersToday.map(order => {
              const displayMethod = getDisplayMethod(order.paymentMethod);
              return (
                <View key={order._id} style={styles.orderCard}>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderNumber}>#{order.orderId}</Text>
                    <Text style={styles.orderCustomer}>{order.customerName}</Text>
                  </View>
                  <View style={styles.orderPayment}>
                    <Text style={styles.orderAmount}>${order.totalAmount.toFixed(2)}</Text>
                    <View style={[
                      styles.paymentBadge,
                      { backgroundColor: PAYMENT_METHODS.find(m => m.key === displayMethod)?.color || '#94a3b8' }
                    ]}>
                      <Text style={styles.paymentBadgeText}>{displayMethod}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Credit Deposits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credit Deposits ({creditTransactions.length})</Text>
          {creditTransactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No credit deposits for this date</Text>
            </View>
          ) : (
            creditTransactions.map((tx, index) => {
              const method = (tx.paymentMethod || 'cash') as DisplayPaymentMethod;
              return (
                <View key={`credit-${index}`} style={styles.orderCard}>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderNumber}>{tx.customerName}</Text>
                    <Text style={styles.orderCustomer}>{tx.description}</Text>
                  </View>
                  <View style={styles.orderPayment}>
                    <Text style={[styles.orderAmount, { color: '#10b981' }]}>+${tx.amount.toFixed(2)}</Text>
                    <View style={[
                      styles.paymentBadge,
                      { backgroundColor: PAYMENT_METHODS.find(m => m.key === method)?.color || '#94a3b8' }
                    ]}>
                      <Text style={styles.paymentBadgeText}>{method}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Orders Paid with Credit - shown but not counted as income */}
        {creditPaidOrdersToday.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paid with Credit ({creditPaidOrdersToday.length})</Text>
            <Text style={styles.creditPaidNote}>
              Not counted in totals - money was collected when credit was added
            </Text>
            {creditPaidOrdersToday.map(order => (
              <View key={order._id} style={[styles.orderCard, styles.creditPaidCard]}>
                <View style={styles.orderInfo}>
                  <Text style={styles.orderNumber}>#{order.orderId}</Text>
                  <Text style={styles.orderCustomer}>{order.customerName}</Text>
                </View>
                <View style={styles.orderPayment}>
                  <Text style={[styles.orderAmount, { color: '#94a3b8' }]}>${order.totalAmount.toFixed(2)}</Text>
                  <View style={[styles.paymentBadge, { backgroundColor: '#94a3b8' }]}>
                    <Text style={styles.paymentBadgeText}>credit</Text>
                  </View>
                </View>
              </View>
            ))}
            <View style={styles.creditPaidSummary}>
              <Text style={styles.creditPaidSummaryText}>
                Credit payments total: ${creditPaidTotal.toFixed(2)} (not in revenue)
              </Text>
            </View>
          </View>
        )}

        {/* Print & Share Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.printButton, printing && styles.buttonDisabled]}
            onPress={handlePrint}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="print-outline" size={20} color="#fff" />
            )}
            <Text style={styles.buttonText}>
              {printing ? 'Printing...' : 'Print'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text style={styles.buttonText}>Share</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  },
  storeName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  dateArrow: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  todayLink: {
    fontSize: 12,
    color: '#2563eb',
    textAlign: 'center',
    marginTop: 4,
  },
  summarySection: {
    padding: 16,
  },
  totalCard: {
    backgroundColor: '#10b981',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  totalOrders: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  methodCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  methodLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  creditNote: {
    fontSize: 11,
    color: '#10b981',
    marginTop: 2,
  },
  methodStats: {
    alignItems: 'flex-end',
  },
  methodCount: {
    fontSize: 12,
    color: '#64748b',
  },
  methodTotal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  orderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  orderInfo: {},
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  orderCustomer: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  orderPayment: {
    alignItems: 'flex-end',
  },
  orderAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  buttonRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 12,
  },
  printButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 12,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  creditPaidCard: {
    backgroundColor: '#f8fafc',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  creditPaidNote: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  creditPaidSummary: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  creditPaidSummaryText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
});
