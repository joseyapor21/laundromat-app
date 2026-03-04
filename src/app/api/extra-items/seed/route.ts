import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ExtraItem } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

// Price list from E&F Laundry Services
const EXTRA_ITEMS_SEED = [
  // Extra Services
  { name: 'Separate Clothing', category: 'service', minimumPrice: 3, price: 0.20, unitType: 'lb', description: 'Keep clothing items separated' },
  { name: 'Separate Wash', category: 'service', minimumPrice: 3, price: 0.20, unitType: 'lb', description: 'Wash separately from other items' },
  { name: 'Extra Wash', category: 'service', minimumPrice: 3, price: 0.20, unitType: 'lb', description: 'Additional wash cycle' },
  { name: 'Low Heat', category: 'service', minimumPrice: 3, price: 0.35, unitType: 'lb', description: 'Dry on low heat setting' },
  { name: 'Hang Dry', category: 'service', minimumPrice: 5, price: 0.25, unitType: 'item', description: 'Air dry instead of machine dry' },
  { name: 'Hanger', category: 'service', minimumPrice: 0, price: 0.20, unitType: 'each', description: 'Hang on hanger' },

  // Products
  { name: 'Free & Clear', category: 'product', minimumPrice: 3, price: 0.20, unitType: 'lb', description: 'Fragrance-free detergent' },
  { name: 'Tide / Tide & Downy', category: 'product', minimumPrice: 3, price: 0.20, unitType: 'lb', description: 'Premium Tide detergent' },
  { name: 'Suavitel', category: 'product', minimumPrice: 3, price: 0.20, unitType: 'lb', description: 'Suavitel fabric softener' },
  { name: 'Extra Softener', category: 'product', minimumPrice: 2, price: 0.15, unitType: 'lb', description: 'Additional fabric softener' },
  { name: 'Bleach', category: 'product', minimumPrice: 1.50, price: 0.10, unitType: 'lb', description: 'Color-safe or regular bleach' },
  { name: 'Vinegar', category: 'product', minimumPrice: 1.50, price: 0.10, unitType: 'lb', description: 'Natural cleaning with vinegar' },
  { name: 'Baking Soda', category: 'product', minimumPrice: 1.50, price: 0.10, unitType: 'lb', description: 'Baking soda for freshness' },
  { name: 'Oxi Clean', category: 'product', minimumPrice: 2, price: 0.15, unitType: 'lb', description: 'OxiClean stain remover' },
];

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    await connectDB();

    const { locationId, updateExisting = false } = await request.json().catch(() => ({}));
    const targetLocationId = locationId || currentUser.locationId;

    const results = {
      created: [] as string[],
      updated: [] as string[],
      skipped: [] as string[],
    };

    for (const item of EXTRA_ITEMS_SEED) {
      // Check if item already exists
      const existing = await ExtraItem.findOne({
        name: item.name,
        ...(targetLocationId && { locationId: targetLocationId }),
      });

      if (existing) {
        if (updateExisting) {
          // Update existing item with new prices
          await ExtraItem.updateOne(
            { _id: existing._id },
            {
              $set: {
                minimumPrice: item.minimumPrice,
                price: item.price,
                unitType: item.unitType,
                category: item.category,
                description: item.description,
              }
            }
          );
          results.updated.push(item.name);
        } else {
          results.skipped.push(item.name);
        }
      } else {
        // Create new item
        await ExtraItem.create({
          ...item,
          isActive: true,
          perWeightUnit: item.unitType === 'lb' ? 1 : null,
          ...(targetLocationId && { locationId: targetLocationId }),
        });
        results.created.push(item.name);
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Created ${results.created.length}, updated ${results.updated.length}, skipped ${results.skipped.length} items`,
    });
  } catch (error) {
    console.error('Seed extra items error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
