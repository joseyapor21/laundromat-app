import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { getCurrentUser } from '@/lib/auth/server';
import mongoose from 'mongoose';

// CallerID Device Schema
const callerIdDeviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  deviceName: { type: String, required: true },
  registeredBy: { type: String, required: true }, // user email
  registeredByName: { type: String }, // user name
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
  locationName: { type: String },
  registeredAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  isStorePhone: { type: Boolean, default: true }, // Store phone mode - limited UI, caller ID only
});

// Get or create model
const CallerIdDevice = mongoose.models.CallerIdDevice || mongoose.model('CallerIdDevice', callerIdDeviceSchema);

// GET - Check if device is registered or list all devices (admin)
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const listAll = searchParams.get('listAll');

    // Check specific device registration
    if (deviceId) {
      const device = await CallerIdDevice.findOne({ deviceId, isActive: true });
      return NextResponse.json({
        isRegistered: !!device,
        isStorePhone: device?.isStorePhone ?? false,
        device: device ? {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          locationName: device.locationName,
          registeredAt: device.registeredAt,
          isStorePhone: device.isStorePhone,
        } : null,
      });
    }

    // List all devices (admin only)
    if (listAll) {
      if (!['admin', 'super_admin'].includes(currentUser.role || '')) {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        );
      }

      const devices = await CallerIdDevice.find({ isActive: true }).sort({ registeredAt: -1 });
      return NextResponse.json({ devices });
    }

    return NextResponse.json({ error: 'deviceId or listAll parameter required' }, { status: 400 });
  } catch (error) {
    console.error('Error checking device registration:', error);
    return NextResponse.json(
      { error: 'Failed to check device registration' },
      { status: 500 }
    );
  }
}

// POST - Register device for Caller ID
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only admin/super_admin can register devices
    if (!['admin', 'super_admin'].includes(currentUser.role || '')) {
      return NextResponse.json(
        { error: 'Admin access required to register devices' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { deviceId, deviceName, locationId, locationName, isStorePhone = true } = body;

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    if (!deviceName) {
      return NextResponse.json(
        { error: 'Device name is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Check if device already exists
    const existingDevice = await CallerIdDevice.findOne({ deviceId });

    if (existingDevice) {
      // Update existing device
      existingDevice.deviceName = deviceName;
      existingDevice.locationId = locationId;
      existingDevice.locationName = locationName;
      existingDevice.isActive = true;
      existingDevice.isStorePhone = isStorePhone;
      existingDevice.registeredBy = currentUser.email;
      existingDevice.registeredByName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
      existingDevice.registeredAt = new Date();
      await existingDevice.save();

      console.log(`CallerID device updated: ${deviceName} (${deviceId}) by ${currentUser.email}`);
      return NextResponse.json({ success: true, message: 'Device updated', device: existingDevice });
    }

    // Create new device registration
    const device = new CallerIdDevice({
      deviceId,
      deviceName,
      locationId,
      locationName,
      isStorePhone,
      registeredBy: currentUser.email,
      registeredByName: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
    });

    await device.save();

    console.log(`CallerID device registered: ${deviceName} (${deviceId}) by ${currentUser.email}`);

    return NextResponse.json({ success: true, message: 'Device registered', device });
  } catch (error) {
    console.error('Error registering device:', error);
    return NextResponse.json(
      { error: 'Failed to register device' },
      { status: 500 }
    );
  }
}

// DELETE - Unregister device
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Only admin/super_admin can unregister devices
    if (!['admin', 'super_admin'].includes(currentUser.role || '')) {
      return NextResponse.json(
        { error: 'Admin access required to unregister devices' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const device = await CallerIdDevice.findOne({ deviceId });

    if (!device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    // Soft delete - mark as inactive
    device.isActive = false;
    await device.save();

    console.log(`CallerID device unregistered: ${device.deviceName} (${deviceId}) by ${currentUser.email}`);

    return NextResponse.json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    console.error('Error unregistering device:', error);
    return NextResponse.json(
      { error: 'Failed to unregister device' },
      { status: 500 }
    );
  }
}
