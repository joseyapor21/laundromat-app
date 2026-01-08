import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connection';
import ExtraItem from '@/lib/db/models/ExtraItem';

// Items that should be priced per 15 lbs
const weightBasedItems = [
  'Separation Fee',
  'Free & Clear Detergent',
  'Tide Detergent',
  'Tide + Downy',
  'Suavitel Softener',
  'Extra Softener',
  'Bleach',
  'Vinegar',
];

export async function POST(request: NextRequest) {
  try {
    // Check authentication - only admins can update
    const userRole = request.headers.get('x-user-role');
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await dbConnect();

    const results: string[] = [];

    for (const name of weightBasedItems) {
      const result = await ExtraItem.updateOne(
        { name },
        { $set: { perWeightUnit: 15 } }
      );
      if (result.matchedCount > 0) {
        results.push(`Updated: ${name} -> per 15 lbs`);
      } else {
        results.push(`Not found: ${name}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Weight-based items updated',
      results,
    });
  } catch (error) {
    console.error('Error updating weight items:', error);
    return NextResponse.json(
      { error: 'Failed to update items' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await dbConnect();
    const items = await ExtraItem.find({ perWeightUnit: { $exists: true, $ne: null } });
    return NextResponse.json({
      count: items.length,
      items: items.map(i => ({ name: i.name, price: i.price, perWeightUnit: i.perWeightUnit })),
    });
  } catch (error) {
    console.error('Error getting weight items:', error);
    return NextResponse.json(
      { error: 'Failed to get items' },
      { status: 500 }
    );
  }
}
