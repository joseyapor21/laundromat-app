import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connection';
import ExtraItem from '@/lib/db/models/ExtraItem';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const specialItems = [
  // Comforters
  { name: 'Comforter - Twin', description: 'Twin size comforter', price: 10, isActive: true, category: 'bedding' },
  { name: 'Comforter - Full', description: 'Full size comforter', price: 12, isActive: true, category: 'bedding' },
  { name: 'Comforter - Queen', description: 'Queen size comforter', price: 15, isActive: true, category: 'bedding' },
  { name: 'Comforter - King', description: 'King size comforter', price: 20, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - Twin', description: 'Twin size down comforter (+$10)', price: 20, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - Full', description: 'Full size down comforter (+$10)', price: 22, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - Queen', description: 'Queen size down comforter (+$10)', price: 25, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - King', description: 'King size down comforter (+$10)', price: 30, isActive: true, category: 'bedding' },

  // Other bedding
  { name: 'Down Jacket', description: 'Down jacket cleaning', price: 15, isActive: true, category: 'special' },
  { name: 'Sleeping Bag', description: 'Sleeping bag cleaning', price: 20, isActive: true, category: 'special' },
  { name: 'Blanket/Quilt - Small', description: 'Small blanket or quilt', price: 10, isActive: true, category: 'bedding' },
  { name: 'Blanket/Quilt - Large', description: 'Large blanket or quilt', price: 20, isActive: true, category: 'bedding' },
  { name: 'Mattress Cover - Small', description: 'Twin/Full mattress cover', price: 5, isActive: true, category: 'bedding' },
  { name: 'Mattress Cover - Large', description: 'Queen/King mattress cover', price: 10, isActive: true, category: 'bedding' },
  { name: 'Pillow - Small', description: 'Standard pillow', price: 5, isActive: true, category: 'bedding' },
  { name: 'Pillow - Large', description: 'King/body pillow', price: 8, isActive: true, category: 'bedding' },
  { name: 'Pet Bed - Small', description: 'Small pet bed', price: 8, isActive: true, category: 'special' },
  { name: 'Pet Bed - Large', description: 'Large pet bed', price: 15, isActive: true, category: 'special' },
  { name: 'Bathmat - Small', description: 'Small bathmat', price: 3, isActive: true, category: 'special' },
  { name: 'Bathmat - Large', description: 'Large bathmat', price: 10, isActive: true, category: 'special' },

  // Services/Fees
  { name: 'Separation Fee', description: 'Separate laundry (per 15 lbs)', price: 3, isActive: true, category: 'service' },
  { name: 'Low Temp/Delicate Dry', description: 'Delicate drying per bag', price: 5, isActive: true, category: 'service' },
  { name: 'Hang Dry (per item)', description: 'Hang dry per item', price: 0.25, isActive: true, category: 'service' },
  { name: 'Hanger', description: 'Hanger fee each', price: 0.15, isActive: true, category: 'service' },

  // Detergents & Softeners
  { name: 'Free & Clear Detergent', description: 'Hypoallergenic detergent (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Tide Detergent', description: 'Tide detergent (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Tide + Downy', description: 'Tide with Downy (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Suavitel Softener', description: 'Suavitel fabric softener (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Extra Softener', description: 'Extra softener (per 15 lbs)', price: 2, isActive: true, category: 'detergent' },
  { name: 'Bleach', description: 'Bleach treatment (per 15 lbs)', price: 1.50, isActive: true, category: 'detergent' },
  { name: 'Vinegar', description: 'Vinegar treatment (per 15 lbs)', price: 1.50, isActive: true, category: 'detergent' },
];

export async function POST(request: NextRequest) {
  try {
    // Check authentication - only admins can seed
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const existingCount = await ExtraItem.countDocuments();
    let added = 0;
    const addedItems: string[] = [];
    const skippedItems: string[] = [];

    for (const item of specialItems) {
      const exists = await ExtraItem.findOne({ name: item.name });
      if (!exists) {
        await ExtraItem.create(item);
        addedItems.push(item.name);
        added++;
      } else {
        skippedItems.push(item.name);
      }
    }

    const totalCount = await ExtraItem.countDocuments();

    return NextResponse.json({
      success: true,
      message: `Added ${added} new items`,
      existingBefore: existingCount,
      totalAfter: totalCount,
      addedItems,
      skippedItems,
    });
  } catch (error) {
    console.error('Error seeding extra items:', error);
    return NextResponse.json(
      { error: 'Failed to seed extra items' },
      { status: 500 }
    );
  }
}

// GET to check current count
export async function GET() {
  try {
    await dbConnect();
    const count = await ExtraItem.countDocuments();
    const items = await ExtraItem.find().sort({ category: 1, name: 1 });
    return NextResponse.json({ count, items });
  } catch (error) {
    console.error('Error getting extra items:', error);
    return NextResponse.json(
      { error: 'Failed to get extra items' },
      { status: 500 }
    );
  }
}
