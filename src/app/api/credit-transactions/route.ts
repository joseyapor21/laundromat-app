import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

// GET /api/credit-transactions - Get credit additions for a date
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const locationId = searchParams.get('locationId');

    if (!dateStr) {
      return NextResponse.json(
        { error: 'Date parameter is required' },
        { status: 400 }
      );
    }

    // Parse the date (expects YYYY-MM-DD format)
    const targetDate = new Date(dateStr);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Build query
    const query: Record<string, unknown> = {
      'creditHistory.type': 'add',
      'creditHistory.createdAt': {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    };

    if (locationId) {
      query.locationId = locationId;
    }

    // Find customers with credit additions on this date
    const customers = await Customer.find(query).lean();

    // Extract credit additions for the target date
    const creditAdditions: Array<{
      customerId: string;
      customerName: string;
      amount: number;
      description: string;
      paymentMethod: string;
      addedBy: string;
      createdAt: Date;
    }> = [];

    customers.forEach(customer => {
      if (customer.creditHistory) {
        customer.creditHistory.forEach((tx: {
          type: string;
          amount: number;
          description?: string;
          paymentMethod?: string;
          addedBy?: string;
          createdAt: Date;
        }) => {
          if (tx.type === 'add') {
            const txDate = new Date(tx.createdAt);
            if (txDate >= startOfDay && txDate <= endOfDay) {
              creditAdditions.push({
                customerId: customer._id.toString(),
                customerName: customer.name,
                amount: tx.amount,
                description: tx.description || 'Credit added',
                paymentMethod: tx.paymentMethod || 'cash',
                addedBy: tx.addedBy || 'Unknown',
                createdAt: tx.createdAt,
              });
            }
          }
        });
      }
    });

    // Sort by createdAt descending
    creditAdditions.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Calculate totals by payment method
    const totalsByMethod: Record<string, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      check: { count: 0, total: 0 },
      venmo: { count: 0, total: 0 },
      zelle: { count: 0, total: 0 },
    };

    creditAdditions.forEach(tx => {
      const method = tx.paymentMethod || 'cash';
      if (totalsByMethod[method]) {
        totalsByMethod[method].count++;
        totalsByMethod[method].total += tx.amount;
      } else {
        totalsByMethod.cash.count++;
        totalsByMethod.cash.total += tx.amount;
      }
    });

    const grandTotal = creditAdditions.reduce((sum, tx) => sum + tx.amount, 0);

    return NextResponse.json({
      transactions: creditAdditions,
      totalsByMethod,
      grandTotal,
      count: creditAdditions.length,
    });
  } catch (error) {
    console.error('Get credit transactions error:', error);
    return NextResponse.json(
      { error: 'Failed to get credit transactions' },
      { status: 500 }
    );
  }
}
