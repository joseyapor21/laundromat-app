import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { connectDB } from '@/lib/db/connection';
import { Order, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Upload verification photo for a machine assignment
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await connectDB();
    const { id: orderId } = await params;
    const body = await request.json();
    const { machineId, photoBase64 } = body;

    if (!machineId || !photoBase64) {
      return NextResponse.json(
        { error: 'Machine ID and photo are required' },
        { status: 400 }
      );
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Find the machine assignment
    const assignmentIndex = order.machineAssignments?.findIndex(
      (a: { machineId: string; removedAt?: Date }) =>
        a.machineId === machineId && !a.removedAt
    );

    if (assignmentIndex === undefined || assignmentIndex === -1) {
      return NextResponse.json(
        { error: 'Machine assignment not found' },
        { status: 404 }
      );
    }

    // Save the photo to file system
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'machine-verification');
    console.log('Creating uploads directory:', uploadsDir);
    await mkdir(uploadsDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `${orderId}_${machineId}_${timestamp}.jpg`;
    const filePath = path.join(uploadsDir, fileName);

    // Remove base64 prefix if present
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    console.log('Writing photo to:', filePath, 'Size:', buffer.length);
    await writeFile(filePath, buffer);

    // Update the machine assignment with the photo path
    const photoPath = `/uploads/machine-verification/${fileName}`;
    const machineAssignments = order.machineAssignments!;
    const assignment = machineAssignments[assignmentIndex];
    assignment.verificationPhoto = photoPath;
    assignment.verificationPhotoAt = new Date();

    await order.save();

    // Log activity
    try {
      await ActivityLog.create({
        locationId: order.locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'machine_verification_photo',
        entityType: 'order',
        entityId: orderId,
        details: `Added verification photo for ${assignment.machineName}`,
        metadata: {
          orderId: order.orderId,
          machineId,
          machineName: assignment.machineName,
          photoPath,
        },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      message: 'Verification photo saved',
      photoPath,
      order,
    });
  } catch (error) {
    console.error('Upload machine photo error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to upload photo', details: errorMessage },
      { status: 500 }
    );
  }
}
