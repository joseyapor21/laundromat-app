import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { verifyToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// Set or update a user's PIN
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { id } = await params;
    const { pin } = await request.json();

    // Users can only set their own PIN, unless they're admin
    const isAdmin = decoded.role === 'admin' || decoded.role === 'super_admin' || decoded.isSuperUser;
    if (decoded._id !== id && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to set PIN for other users' }, { status: 403 });
    }

    // Validate PIN format (exactly 4 digits)
    if (pin && (!/^\d{4}$/.test(pin))) {
      return NextResponse.json(
        { error: 'PIN must be exactly 4 digits' },
        { status: 400 }
      );
    }

    await connectDB();

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Hash the PIN if provided, or set to null to remove
    if (pin) {
      user.pin = await bcrypt.hash(pin, 10);
    } else {
      user.pin = undefined;
    }

    await user.save();

    return NextResponse.json({
      success: true,
      message: pin ? 'PIN updated successfully' : 'PIN removed',
    });
  } catch (error) {
    console.error('Set PIN error:', error);
    return NextResponse.json(
      { error: 'An error occurred while setting PIN' },
      { status: 500 }
    );
  }
}

// Remove a user's PIN
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { id } = await params;

    // Users can only remove their own PIN, unless they're admin
    const isAdmin = decoded.role === 'admin' || decoded.role === 'super_admin' || decoded.isSuperUser;
    if (decoded._id !== id && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    await connectDB();

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    user.pin = undefined;
    await user.save();

    return NextResponse.json({
      success: true,
      message: 'PIN removed',
    });
  } catch (error) {
    console.error('Remove PIN error:', error);
    return NextResponse.json(
      { error: 'An error occurred while removing PIN' },
      { status: 500 }
    );
  }
}
