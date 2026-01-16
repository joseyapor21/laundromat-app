import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { notifyPaymentReceived } from './pushNotifications';
import type { ParsedPayment } from './gmailPayments';

export interface MatchResult {
  success: boolean;
  orderId?: string;
  orderNumber?: number;
  customerName?: string;
  matchType: 'exact' | 'fuzzy' | 'amount_only' | 'no_match' | 'multiple_matches';
  message: string;
  candidates?: Array<{
    orderId: string;
    orderNumber: number;
    customerName: string;
    totalAmount: number;
  }>;
}

export interface PaymentProcessResult {
  emailId: string;
  payment: ParsedPayment;
  match: MatchResult;
  notificationSent: boolean;
}

/**
 * Normalize name for comparison (lowercase, remove extra spaces, etc.)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, ''); // Remove special characters
}

/**
 * Calculate similarity score between two names (0-1)
 * Uses Levenshtein-like approach
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // Check if words match (order independent)
  const words1 = n1.split(' ').filter(w => w.length > 1);
  const words2 = n2.split(' ').filter(w => w.length > 1);

  let matchingWords = 0;
  for (const w1 of words1) {
    if (words2.some(w2 => w1 === w2 || w1.includes(w2) || w2.includes(w1))) {
      matchingWords++;
    }
  }

  const maxWords = Math.max(words1.length, words2.length);
  if (maxWords === 0) return 0;

  return matchingWords / maxWords;
}

/**
 * Find unpaid orders matching the payment amount and customer name
 */
export async function findMatchingOrder(
  senderName: string,
  amount: number,
  tolerance: number = 0.01
): Promise<MatchResult> {
  await connectDB();

  // Find unpaid orders with matching amount (within tolerance)
  const minAmount = amount - tolerance;
  const maxAmount = amount + tolerance;

  const candidates = await Order.find({
    isPaid: false,
    totalAmount: { $gte: minAmount, $lte: maxAmount },
    status: { $ne: 'completed' }, // Don't match completed orders
  }).lean();

  if (candidates.length === 0) {
    return {
      success: false,
      matchType: 'no_match',
      message: `No unpaid orders found with amount $${amount.toFixed(2)}`,
    };
  }

  // Score each candidate based on name similarity
  const scoredCandidates = candidates.map(order => ({
    order,
    nameScore: calculateNameSimilarity(senderName, order.customerName),
    amountMatch: Math.abs(order.totalAmount - amount) <= tolerance,
  }));

  // Sort by name score descending
  scoredCandidates.sort((a, b) => b.nameScore - a.nameScore);

  // Check for exact name match (score >= 0.85)
  const exactMatches = scoredCandidates.filter(c => c.nameScore >= 0.85);

  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    return {
      success: true,
      orderId: match.order._id.toString(),
      orderNumber: match.order.orderId,
      customerName: match.order.customerName,
      matchType: 'exact',
      message: `Exact match found: Order #${match.order.orderId} for ${match.order.customerName}`,
    };
  }

  if (exactMatches.length > 1) {
    return {
      success: false,
      matchType: 'multiple_matches',
      message: `Multiple orders found with similar name and amount`,
      candidates: exactMatches.map(c => ({
        orderId: c.order._id.toString(),
        orderNumber: c.order.orderId,
        customerName: c.order.customerName,
        totalAmount: c.order.totalAmount,
      })),
    };
  }

  // Check for fuzzy name match (score >= 0.5)
  const fuzzyMatches = scoredCandidates.filter(c => c.nameScore >= 0.5);

  if (fuzzyMatches.length === 1) {
    const match = fuzzyMatches[0];
    return {
      success: true,
      orderId: match.order._id.toString(),
      orderNumber: match.order.orderId,
      customerName: match.order.customerName,
      matchType: 'fuzzy',
      message: `Fuzzy match found: Order #${match.order.orderId} for ${match.order.customerName} (name similarity: ${(match.nameScore * 100).toFixed(0)}%)`,
    };
  }

  if (fuzzyMatches.length > 1) {
    return {
      success: false,
      matchType: 'multiple_matches',
      message: `Multiple possible matches found - manual review required`,
      candidates: fuzzyMatches.slice(0, 5).map(c => ({
        orderId: c.order._id.toString(),
        orderNumber: c.order.orderId,
        customerName: c.order.customerName,
        totalAmount: c.order.totalAmount,
      })),
    };
  }

  // If only one candidate with matching amount but low name score
  if (candidates.length === 1) {
    const match = scoredCandidates[0];
    return {
      success: false,
      matchType: 'amount_only',
      message: `Found order with matching amount but name doesn't match well: "${senderName}" vs "${match.order.customerName}"`,
      candidates: [{
        orderId: match.order._id.toString(),
        orderNumber: match.order.orderId,
        customerName: match.order.customerName,
        totalAmount: match.order.totalAmount,
      }],
    };
  }

  return {
    success: false,
    matchType: 'multiple_matches',
    message: `Multiple orders with matching amount found but no name match`,
    candidates: scoredCandidates.slice(0, 5).map(c => ({
      orderId: c.order._id.toString(),
      orderNumber: c.order.orderId,
      customerName: c.order.customerName,
      totalAmount: c.order.totalAmount,
    })),
  };
}

/**
 * Mark an order as paid
 */
export async function markOrderAsPaid(
  orderId: string,
  paymentMethod: 'zelle' | 'venmo',
  emailDetails: {
    emailId: string;
    senderName: string;
    amount: number;
    receivedAt: Date;
  }
): Promise<{ success: boolean; order?: typeof Order.prototype; error?: string }> {
  await connectDB();

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.isPaid) {
      return { success: false, error: 'Order is already paid' };
    }

    // Update order
    order.isPaid = true;
    order.paidAt = new Date();
    order.paidBy = 'Payment System';
    order.paymentMethod = paymentMethod;

    // Add to status history
    order.statusHistory.push({
      status: order.status,
      changedBy: 'Payment System',
      changedAt: new Date(),
      notes: `Payment received via ${paymentMethod.toUpperCase()} from ${emailDetails.senderName} ($${emailDetails.amount.toFixed(2)})`,
    });

    await order.save();

    return { success: true, order };
  } catch (error) {
    console.error('Error marking order as paid:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Log payment match activity
 */
export async function logPaymentMatch(
  order: { _id: string; orderId: number; customerName: string; totalAmount: number },
  payment: ParsedPayment,
  matchType: string
): Promise<void> {
  try {
    await ActivityLog.create({
      userId: 'system',
      userName: 'Payment System',
      action: 'payment_auto_matched',
      entityType: 'order',
      entityId: order._id,
      details: `Auto-matched ${payment.paymentMethod.toUpperCase()} payment from ${payment.senderName} ($${payment.amount.toFixed(2)}) to Order #${order.orderId}`,
      metadata: {
        orderId: order.orderId,
        customerName: order.customerName,
        orderAmount: order.totalAmount,
        paymentAmount: payment.amount,
        paymentSender: payment.senderName,
        paymentMethod: payment.paymentMethod,
        matchType,
        emailId: payment.emailId,
      },
      ipAddress: 'system',
      userAgent: 'Payment Auto-Matcher',
    });
  } catch (error) {
    console.error('Error logging payment match:', error);
  }
}

/**
 * Process a single payment and try to match it to an order
 */
export async function processPayment(payment: ParsedPayment): Promise<PaymentProcessResult> {
  const match = await findMatchingOrder(payment.senderName, payment.amount);

  const result: PaymentProcessResult = {
    emailId: payment.emailId,
    payment,
    match,
    notificationSent: false,
  };

  if (match.success && match.orderId && match.orderNumber && match.customerName) {
    // Mark order as paid
    const updateResult = await markOrderAsPaid(match.orderId, payment.paymentMethod, {
      emailId: payment.emailId,
      senderName: payment.senderName,
      amount: payment.amount,
      receivedAt: payment.receivedAt,
    });

    if (updateResult.success && updateResult.order) {
      // Log the match
      await logPaymentMatch(
        {
          _id: match.orderId,
          orderId: match.orderNumber,
          customerName: match.customerName,
          totalAmount: payment.amount,
        },
        payment,
        match.matchType
      );

      // Send push notification
      try {
        await notifyPaymentReceived(
          match.orderId,
          match.orderNumber,
          match.customerName,
          payment.amount,
          payment.paymentMethod.toUpperCase()
        );
        result.notificationSent = true;
      } catch (error) {
        console.error('Error sending payment notification:', error);
      }
    } else {
      result.match = {
        ...match,
        success: false,
        message: updateResult.error || 'Failed to update order',
      };
    }
  }

  return result;
}
