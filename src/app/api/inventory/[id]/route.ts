import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { InventoryItem } from '@/lib/db/models';
import { getCurrentUser, getLocationId } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get single inventory item
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const item = await InventoryItem.findById(id).lean();
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

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
    console.error('Get inventory item error:', error);
    return NextResponse.json(
      { error: 'Failed to get inventory item' },
      { status: 500 }
    );
  }
}

// PUT - Update inventory item
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, quantity, status, lowStockThreshold, unit, category, notes, needsOrder, orderQuantity } = body;

    await connectDB();

    const item = await InventoryItem.findById(id);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Update fields
    if (name !== undefined) item.name = name;
    if (quantity !== undefined) item.quantity = quantity;
    if (status !== undefined) item.status = status;
    if (lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
    if (unit !== undefined) item.unit = unit;
    if (category !== undefined) item.category = category;
    if (notes !== undefined) item.notes = notes;
    if (needsOrder !== undefined) item.needsOrder = needsOrder;
    if (orderQuantity !== undefined) item.orderQuantity = orderQuantity;

    item.lastUpdated = new Date();
    item.lastUpdatedBy = user.name;

    await item.save();

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
    console.error('Update inventory item error:', error);
    return NextResponse.json(
      { error: 'Failed to update inventory item' },
      { status: 500 }
    );
  }
}

// DELETE - Delete inventory item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is admin
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    await connectDB();

    const item = await InventoryItem.findByIdAndDelete(id);
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    return NextResponse.json(
      { error: 'Failed to delete inventory item' },
      { status: 500 }
    );
  }
}
