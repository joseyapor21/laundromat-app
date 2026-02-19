import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import fs from 'fs/promises';
import path from 'path';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get air dry items for an order
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();
    const { id } = await params;

    const order = await Order.findById(id).select('airDryItems').lean();

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      airDryItems: order.airDryItems || [],
    });
  } catch (error) {
    console.error('Get air dry items error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// POST - Add an air dry item with photo
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();
    const { id } = await params;
    const { photo, description, taggedBy, taggedByInitials } = await request.json();

    if (!photo) {
      return NextResponse.json(
        { error: 'Photo is required' },
        { status: 400 }
      );
    }

    // Find the order
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Save photo to file system
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const timestamp = now.getTime();
    const fileName = `${order.orderId}_airdry_${timestamp}.jpg`;
    const relativePath = `air-dry/${yearMonth}/${fileName}`;

    // Create directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'air-dry', yearMonth);
    await fs.mkdir(uploadDir, { recursive: true });

    // Save the photo (base64 to file)
    const photoBuffer = Buffer.from(photo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, photoBuffer);

    // Add air dry item to order
    const airDryItem = {
      photoPath: relativePath,
      description: description || '',
      taggedAt: now,
      taggedBy: taggedBy || currentUser.name,
      taggedByInitials: taggedByInitials || '',
    };

    if (!order.airDryItems) {
      order.airDryItems = [];
    }
    order.airDryItems.push(airDryItem);

    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_order',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Air dry item added to Order #${order.orderId}`,
        metadata: {
          orderId: order.orderId,
          description,
          taggedBy,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Air dry item added',
      airDryItem: order.airDryItems[order.airDryItems.length - 1],
    });
  } catch (error) {
    console.error('Add air dry item error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// DELETE - Remove an air dry item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();
    const { id } = await params;
    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Find the order
    const order = await Order.findById(id);

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Find and remove the air dry item
    const itemIndex = order.airDryItems?.findIndex(
      (item: { _id?: { toString: () => string } }) => item._id?.toString() === itemId
    );

    if (itemIndex === undefined || itemIndex === -1) {
      return NextResponse.json(
        { error: 'Air dry item not found' },
        { status: 404 }
      );
    }

    // Remove the item
    order.airDryItems?.splice(itemIndex, 1);
    await order.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_order',
        entityType: 'order',
        entityId: order._id.toString(),
        details: `Air dry item removed from Order #${order.orderId}`,
        metadata: {
          orderId: order.orderId,
          removedItemId: itemId,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Air dry item removed',
    });
  } catch (error) {
    console.error('Remove air dry item error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
