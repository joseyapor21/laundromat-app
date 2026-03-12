import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import Order from '@/lib/db/models/Order';
import { getCurrentUser } from '@/lib/auth/server';
import fs from 'fs';
import path from 'path';

// POST - Upload bag photo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const order = await Order.findById(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const body = await request.json();
    const { photo, bagIndex } = body;

    if (!photo) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }
    if (bagIndex === undefined || bagIndex < 0 || bagIndex >= order.bags.length) {
      return NextResponse.json({ error: 'Invalid bag index' }, { status: 400 });
    }

    // Create uploads directory
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uploadsDir = path.join(process.cwd(), 'uploads', 'bag-photos', yearMonth);

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const timestamp = now.getTime();
    const filename = `${order.orderId}_bag${bagIndex}_${timestamp}.jpg`;
    const photoPath = `bag-photos/${yearMonth}/${filename}`;
    const fullPath = path.join(process.cwd(), 'uploads', photoPath);

    const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(fullPath, buffer);

    if (!order.bags[bagIndex].photos) {
      order.bags[bagIndex].photos = [];
    }

    order.bags[bagIndex].photos.push({
      photoPath,
      capturedAt: now,
      capturedBy: currentUser.userId,
      capturedByName: currentUser.name,
    });

    order.markModified('bags');
    await order.save();

    return NextResponse.json({ success: true, photoPath });

  } catch (error) {
    console.error('Error uploading bag photo:', error);
    return NextResponse.json({ error: 'Failed to upload bag photo' }, { status: 500 });
  }
}
