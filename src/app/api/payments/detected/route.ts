import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ActivityLog, Customer, Order } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface DetectedPayment {
  _id: string;
  emailId: string;
  senderName: string;
  amount: number;
  paymentMethod: 'venmo' | 'zelle';
  detectedAt: Date;
  matchedCustomerId?: string;
  matchedCustomerName?: string;
  matchType?: string;
  orderId?: string;
  orderNumber?: number;
}

/**
 * GET - Get all detected payments from activity logs
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !['super_admin', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    // Get limit from query params (default 50)
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    // Find all payment detection activity logs
    const paymentLogs = await ActivityLog.find({
      action: { $in: ['payment_detected', 'payment_auto_matched', 'payment_email_check'] }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Extract unique payments from logs
    const paymentsMap = new Map<string, DetectedPayment>();

    for (const log of paymentLogs) {
      const metadata = log.metadata as Record<string, unknown> || {};
      const emailId = metadata.emailId as string || log.entityId;

      if (!emailId || paymentsMap.has(emailId)) continue;

      // Skip batch check logs that don't have individual payment info
      if (log.action === 'payment_email_check' && !metadata.paymentAmount) continue;

      paymentsMap.set(emailId, {
        _id: log._id.toString(),
        emailId,
        senderName: (metadata.paymentSender || metadata.senderName || 'Unknown') as string,
        amount: (metadata.paymentAmount || metadata.amount || 0) as number,
        paymentMethod: (metadata.paymentMethod || 'venmo') as 'venmo' | 'zelle',
        detectedAt: log.timestamp,
        matchedCustomerId: metadata.customerId as string | undefined,
        matchedCustomerName: (metadata.matchedCustomer || metadata.customerName) as string | undefined,
        matchType: metadata.matchType as string | undefined,
        orderId: metadata.orderId as string | undefined,
        orderNumber: metadata.orderNumber as number | undefined,
      });
    }

    const payments = Array.from(paymentsMap.values());

    return NextResponse.json({
      payments,
      total: payments.length,
    });
  } catch (error) {
    console.error('Get detected payments error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

/**
 * POST - Manually link a payment to a customer
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || !['super_admin', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId, senderName, paymentMethod, emailId, paymentAmount } = await request.json();

    console.log('[LinkPayment] Received:', { customerId, senderName, paymentMethod, emailId, paymentAmount });

    if (!customerId || !senderName || !paymentMethod) {
      return NextResponse.json(
        { error: 'customerId, senderName, and paymentMethod are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Find customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Update customer with payment identifier
    const updateData: Record<string, string> = {};
    if (paymentMethod === 'venmo') {
      updateData.venmoUsername = senderName;
    } else {
      // Determine if it's email or phone
      if (senderName.includes('@')) {
        updateData.zelleEmail = senderName;
      } else {
        updateData.zellePhone = senderName;
      }
    }

    await Customer.findByIdAndUpdate(customerId, { $set: updateData });

    // Try to find a matching unpaid order for this customer
    let matchedOrder: { _id: string; orderId: number } | null = null;

    // Get payment amount from original log if not provided
    let amount = paymentAmount;
    if (!amount && emailId) {
      const originalLog = await ActivityLog.findOne({ entityId: emailId, action: 'payment_detected' });
      if (originalLog?.metadata) {
        const metadata = originalLog.metadata as Record<string, unknown>;
        amount = metadata.paymentAmount || metadata.amount;
      }
    }

    if (amount) {
      // Find customer's unpaid orders that match the amount
      const unpaidOrders = await Order.find({
        customerId: customerId,
        isPaid: false,
        status: { $nin: ['archived'] },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // Find exact amount match
      const exactMatch = unpaidOrders.find(o => Math.abs(o.totalAmount - amount) < 0.01);
      if (exactMatch) {
        matchedOrder = { _id: exactMatch._id.toString(), orderId: exactMatch.orderId };

        // Mark order as paid
        await Order.findByIdAndUpdate(exactMatch._id, {
          isPaid: true,
          paidAt: new Date(),
          paidBy: currentUser.name,
          paymentMethod: paymentMethod,
        });
      }
    }

    // Update the original payment_detected log to mark it as matched
    if (emailId) {
      const logUpdateData: Record<string, unknown> = {
        'metadata.customerId': customerId,
        'metadata.matchedCustomer': customer.name,
        'metadata.matchType': 'manual',
        'metadata.linkedBy': currentUser.name,
        'metadata.linkedAt': new Date(),
      };

      if (matchedOrder) {
        logUpdateData['metadata.orderId'] = matchedOrder._id;
        logUpdateData['metadata.orderNumber'] = matchedOrder.orderId;
      }

      const updateResult = await ActivityLog.updateOne(
        { entityId: emailId, action: 'payment_detected' },
        { $set: logUpdateData }
      );
      console.log('[LinkPayment] Activity log update result:', { emailId, matchedCount: updateResult.matchedCount, modifiedCount: updateResult.modifiedCount });
    } else {
      console.log('[LinkPayment] No emailId provided, skipping activity log update');
    }

    // Log the manual link
    await ActivityLog.create({
      userId: currentUser.userId,
      userName: currentUser.name,
      action: 'payment_manual_link',
      entityType: 'customer',
      entityId: customerId,
      details: matchedOrder
        ? `Linked ${paymentMethod.toUpperCase()} payment to Order #${matchedOrder.orderId} for "${customer.name}"`
        : `Linked ${paymentMethod.toUpperCase()} "${senderName}" to customer "${customer.name}"`,
      metadata: {
        customerId,
        customerName: customer.name,
        senderName,
        paymentMethod,
        emailId,
        ...(matchedOrder ? { orderId: matchedOrder._id, orderNumber: matchedOrder.orderId } : {}),
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    const message = matchedOrder
      ? `Linked payment to Order #${matchedOrder.orderId} for ${customer.name}`
      : `Linked ${paymentMethod} account to ${customer.name}`;

    return NextResponse.json({
      success: true,
      message,
      customer: {
        _id: customer._id,
        name: customer.name,
        venmoUsername: paymentMethod === 'venmo' ? senderName : customer.venmoUsername,
        zelleEmail: paymentMethod === 'zelle' && senderName.includes('@') ? senderName : customer.zelleEmail,
        zellePhone: paymentMethod === 'zelle' && !senderName.includes('@') ? senderName : customer.zellePhone,
      },
      ...(matchedOrder ? { order: matchedOrder } : {}),
    });
  } catch (error) {
    console.error('Link payment error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
