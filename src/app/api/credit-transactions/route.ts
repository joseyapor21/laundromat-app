import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
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

    // Use aggregation to properly filter creditHistory array
    const matchStage: Record<string, unknown> = {
      'creditHistory.0': { $exists: true }, // Has at least one credit history entry
    };

    if (locationId) {
      matchStage.locationId = new mongoose.Types.ObjectId(locationId);
    }

    const results = await Customer.aggregate([
      { $match: matchStage },
      { $unwind: '$creditHistory' },
      {
        $match: {
          'creditHistory.type': 'add',
          'creditHistory.createdAt': {
            $gte: startOfDay,
            $lte: endOfDay,
          },
          // Exclude refunds - only include actual money deposits
          'creditHistory.description': {
            $not: { $regex: /refund/i }
          },
        },
      },
      {
        $project: {
          customerId: '$_id',
          customerName: '$name',
          amount: '$creditHistory.amount',
          description: '$creditHistory.description',
          paymentMethod: { $ifNull: ['$creditHistory.paymentMethod', 'cash'] },
          addedBy: { $ifNull: ['$creditHistory.addedBy', 'Unknown'] },
          createdAt: '$creditHistory.createdAt',
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    // Format the results
    const creditAdditions = results.map(tx => ({
      customerId: tx.customerId.toString(),
      customerName: tx.customerName,
      amount: tx.amount,
      description: tx.description || 'Credit added',
      paymentMethod: tx.paymentMethod,
      addedBy: tx.addedBy,
      createdAt: tx.createdAt,
    }));

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
