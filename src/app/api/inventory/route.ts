import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { InventoryItem } from '@/lib/db/models';
import { getCurrentUser, getLocationId } from '@/lib/auth/server';

// GET - List all inventory items for the current location
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const locationId = await getLocationId();
    if (!locationId) {
      return NextResponse.json({ error: 'Location required' }, { status: 400 });
    }

    await connectDB();

    // Get query params for filtering
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const needsOrder = searchParams.get('needsOrder');

    // Build query
    const query: any = { locationId };
    if (category) query.category = category;
    if (status) query.status = status;
    if (needsOrder === 'true') query.needsOrder = true;

    const items = await InventoryItem.find(query)
      .sort({ category: 1, name: 1 })
      .lean();

    // Get low stock count for notification badge
    const lowStockCount = await InventoryItem.countDocuments({
      locationId,
      $or: [
        { status: 'low' },
        { status: 'out' },
        { needsOrder: true }
      ]
    });

    // Get all unique categories
    const categories = await InventoryItem.distinct('category', { locationId });

    return NextResponse.json({
      items: items.map(item => ({
        _id: item._id.toString(),
        name: item.name,
        quantity: item.quantity,
        status: item.status,
        lowStockThreshold: item.lowStockThreshold,
        unit: item.unit,
        category: item.category,
        notes: item.notes,
        needsOrder: item.needsOrder,
        orderQuantity: item.orderQuantity,
        lastUpdated: item.lastUpdated,
        lastUpdatedBy: item.lastUpdatedBy,
      })),
      lowStockCount,
      categories,
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    return NextResponse.json(
      { error: 'Failed to get inventory' },
      { status: 500 }
    );
  }
}

// POST - Create new inventory item
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const locationId = await getLocationId();
    if (!locationId) {
      return NextResponse.json({ error: 'Location required' }, { status: 400 });
    }

    const body = await request.json();
    const { name, quantity, status, lowStockThreshold, unit, category, notes, needsOrder, orderQuantity } = body;

    if (!name) {
      return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
    }

    await connectDB();

    // Check for duplicate name in same location
    const existing = await InventoryItem.findOne({ locationId, name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return NextResponse.json({ error: 'Item with this name already exists' }, { status: 400 });
    }

    const item = await InventoryItem.create({
      name,
      quantity: quantity || 0,
      status: status || 'good',
      lowStockThreshold: lowStockThreshold || 2,
      unit: unit || 'items',
      category: category || 'General',
      notes: notes || null,
      needsOrder: needsOrder || false,
      orderQuantity: orderQuantity || null,
      locationId,
      lastUpdated: new Date(),
      lastUpdatedBy: user.name,
      createdAt: new Date(),
    });

    return NextResponse.json({
      _id: item._id.toString(),
      name: item.name,
      quantity: item.quantity,
      status: item.status,
      lowStockThreshold: item.lowStockThreshold,
      unit: item.unit,
      category: item.category,
      notes: item.notes,
      needsOrder: item.needsOrder,
      orderQuantity: item.orderQuantity,
      lastUpdated: item.lastUpdated,
      lastUpdatedBy: item.lastUpdatedBy,
    });
  } catch (error) {
    console.error('Create inventory item error:', error);
    return NextResponse.json(
      { error: 'Failed to create inventory item' },
      { status: 500 }
    );
  }
}
