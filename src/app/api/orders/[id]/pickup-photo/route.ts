import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import Order from '@/lib/db/models/Order';
import { verifyToken } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// POST - Upload pickup photo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    await connectDB();

    const order = await Order.findById(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const body = await request.json();
    const { photo } = body;

    if (!photo) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }

    // Create uploads directory structure
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uploadsDir = path.join(process.cwd(), 'uploads', 'pickup-photos', yearMonth);

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Save photo to file
    const timestamp = now.getTime();
    const filename = `${order.orderId}_${timestamp}.jpg`;
    const photoPath = `pickup-photos/${yearMonth}/${filename}`;
    const fullPath = path.join(process.cwd(), 'uploads', photoPath);

    // Decode base64 and save
    const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(fullPath, buffer);

    // Add photo to order
    if (!order.pickupPhotos) {
      order.pickupPhotos = [];
    }

    order.pickupPhotos.push({
      photoPath,
      capturedAt: now,
      capturedBy: decoded.userId,
      capturedByName: `${decoded.firstName} ${decoded.lastName}`,
    });

    await order.save();

    return NextResponse.json({
      success: true,
      photoPath,
      message: 'Pickup photo uploaded successfully',
    });

  } catch (error) {
    console.error('Error uploading pickup photo:', error);
    return NextResponse.json(
      { error: 'Failed to upload pickup photo' },
      { status: 500 }
    );
  }
}

// GET - Get pickup photos for an order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    await connectDB();

    const order = await Order.findById(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({
      photos: order.pickupPhotos || [],
    });

  } catch (error) {
    console.error('Error fetching pickup photos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pickup photos' },
      { status: 500 }
    );
  }
}
