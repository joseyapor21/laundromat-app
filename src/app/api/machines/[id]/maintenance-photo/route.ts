import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import Machine from '@/lib/db/models/Machine';
import { getCurrentUser } from '@/lib/auth/server';
import fs from 'fs';
import path from 'path';

// POST - Upload maintenance photo
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

    const machine = await Machine.findById(id);
    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    const body = await request.json();
    const { photo } = body;

    if (!photo) {
      return NextResponse.json({ error: 'Photo is required' }, { status: 400 });
    }

    // Create uploads directory structure
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const uploadsDir = path.join(process.cwd(), 'uploads', 'maintenance-photos', yearMonth);

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Save photo to file
    const timestamp = now.getTime();
    const filename = `${machine.name}_${timestamp}.jpg`;
    const photoPath = `maintenance-photos/${yearMonth}/${filename}`;
    const fullPath = path.join(process.cwd(), 'uploads', photoPath);

    // Decode base64 and save
    const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(fullPath, buffer);

    // Add photo to machine
    if (!machine.maintenancePhotos) {
      machine.maintenancePhotos = [];
    }

    machine.maintenancePhotos.push({
      photoPath,
      capturedAt: now,
      capturedBy: currentUser.userId,
      capturedByName: currentUser.name,
    });

    await machine.save();

    return NextResponse.json({
      success: true,
      photoPath,
      message: 'Maintenance photo uploaded successfully',
    });

  } catch (error) {
    console.error('Error uploading maintenance photo:', error);
    return NextResponse.json(
      { error: 'Failed to upload maintenance photo' },
      { status: 500 }
    );
  }
}

// GET - Get maintenance photos for a machine
export async function GET(
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

    const machine = await Machine.findById(id);
    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    return NextResponse.json({
      photos: machine.maintenancePhotos || [],
    });

  } catch (error) {
    console.error('Error fetching maintenance photos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maintenance photos' },
      { status: 500 }
    );
  }
}

// DELETE - Clear maintenance photos (when machine is back to available)
export async function DELETE(
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

    const machine = await Machine.findById(id);
    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    // Clear maintenance photos
    machine.maintenancePhotos = [];
    await machine.save();

    return NextResponse.json({
      success: true,
      message: 'Maintenance photos cleared',
    });

  } catch (error) {
    console.error('Error clearing maintenance photos:', error);
    return NextResponse.json(
      { error: 'Failed to clear maintenance photos' },
      { status: 500 }
    );
  }
}
