import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ExtraItem, Location } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';

// POST /api/extra-items/copy - Copy extra items from one location to another
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only allow admin users
    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized - admin only' },
        { status: 403 }
      );
    }

    await connectDB();

    const { sourceLocationId, targetLocationId } = await request.json();

    if (!sourceLocationId || !targetLocationId) {
      return NextResponse.json(
        { error: 'sourceLocationId and targetLocationId are required' },
        { status: 400 }
      );
    }

    // Verify locations exist
    const [sourceLocation, targetLocation] = await Promise.all([
      Location.findById(sourceLocationId),
      Location.findById(targetLocationId),
    ]);

    if (!sourceLocation) {
      return NextResponse.json(
        { error: 'Source location not found' },
        { status: 404 }
      );
    }

    if (!targetLocation) {
      return NextResponse.json(
        { error: 'Target location not found' },
        { status: 404 }
      );
    }

    // Get extra items from source location
    const sourceItems = await ExtraItem.find({ locationId: sourceLocationId }).lean();

    if (sourceItems.length === 0) {
      return NextResponse.json({
        message: 'No extra items found in source location',
        copied: 0,
        skipped: 0,
      });
    }

    // Get existing items in target location
    const existingTargetItems = await ExtraItem.find({ locationId: targetLocationId }).lean();
    const existingNames = new Set(existingTargetItems.map(item => item.name.toLowerCase()));

    // Copy items that don't exist in target
    let copiedCount = 0;
    let skippedCount = 0;
    const copiedItems: string[] = [];
    const skippedItems: string[] = [];

    for (const item of sourceItems) {
      if (existingNames.has(item.name.toLowerCase())) {
        skippedCount++;
        skippedItems.push(item.name);
        continue;
      }

      const newItem = new ExtraItem({
        name: item.name,
        price: item.price,
        perWeightUnit: item.perWeightUnit,
        minimumCharge: item.minimumCharge,
        category: item.category,
        locationId: targetLocationId,
      });

      await newItem.save();
      copiedCount++;
      copiedItems.push(item.name);
    }

    return NextResponse.json({
      message: `Copied ${copiedCount} extra items from ${sourceLocation.name} to ${targetLocation.name}`,
      copied: copiedCount,
      skipped: skippedCount,
      copiedItems,
      skippedItems,
    });
  } catch (error) {
    console.error('Copy extra items error:', error);
    return NextResponse.json(
      { error: 'Failed to copy extra items' },
      { status: 500 }
    );
  }
}

// GET /api/extra-items/copy - Get locations for copying
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    console.log('Copy API - currentUser:', currentUser?.name, 'role:', currentUser?.role);

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only allow admin users
    if (!isAdmin(currentUser)) {
      console.log('User not authorized:', currentUser.role);
      return NextResponse.json(
        { error: 'Not authorized - admin only' },
        { status: 403 }
      );
    }

    await connectDB();

    const locations = await Location.find({}).sort({ name: 1 }).lean();
    console.log('Found locations:', locations.length);

    // Get extra item counts for each location
    const locationsWithCounts = await Promise.all(
      locations.map(async (loc) => {
        const count = await ExtraItem.countDocuments({ locationId: loc._id });
        return {
          _id: loc._id.toString(),
          name: loc.name,
          code: loc.code,
          extraItemCount: count,
        };
      })
    );

    return NextResponse.json({ locations: locationsWithCounts });
  } catch (error) {
    console.error('Get locations for copy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to get locations: ${errorMessage}` },
      { status: 500 }
    );
  }
}
