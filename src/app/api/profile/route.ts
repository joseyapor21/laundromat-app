import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User, ActivityLog } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    // Try to find user in app User model first
    let user = await User.findById(currentUser.userId).select('-password').lean();

    // If not found, check auth database (v5users)
    if (!user) {
      const db = await getAuthDatabase();
      const authUser = await db.collection('v5users').findOne(
        { _id: new ObjectId(currentUser.userId) },
        { projection: { password: 0 } }
      );

      if (authUser) {
        user = {
          _id: authUser._id,
          email: authUser.email,
          firstName: authUser.firstName || currentUser.email.split('@')[0],
          lastName: authUser.lastName || '',
          role: authUser.role || 'employee',
          mustChangePassword: authUser.mustChangePassword || false,
          pushNotificationsEnabled: authUser.pushNotificationsEnabled ?? true,
        } as any;
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      _id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      pushNotificationsEnabled: user.pushNotificationsEnabled ?? true,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const { firstName, lastName, currentPassword, newPassword, pushNotificationsEnabled } = await request.json();

    // Try to find user in app User model first
    let user = await User.findById(currentUser.userId);
    let isAuthDbUser = false;

    // If not found in app model, check auth database
    if (!user) {
      const db = await getAuthDatabase();
      const authUser = await db.collection('v5users').findOne(
        { _id: new ObjectId(currentUser.userId) }
      );

      if (!authUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      isAuthDbUser = true;

      // For auth-only users, we can only update pushNotificationsEnabled
      if (typeof pushNotificationsEnabled === 'boolean') {
        await db.collection('v5users').updateOne(
          { _id: new ObjectId(currentUser.userId) },
          { $set: { pushNotificationsEnabled } }
        );
      }

      return NextResponse.json({
        message: 'Profile updated successfully',
        user: {
          _id: authUser._id.toString(),
          email: authUser.email,
          firstName: authUser.firstName || currentUser.email.split('@')[0],
          lastName: authUser.lastName || '',
          role: authUser.role || 'employee',
          mustChangePassword: authUser.mustChangePassword || false,
          pushNotificationsEnabled: pushNotificationsEnabled ?? authUser.pushNotificationsEnabled ?? true,
        },
      });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required to change password' },
          { status: 400 }
        );
      }

      const isValidPassword = await user.comparePassword(currentPassword);

      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }

      // Hash and set new password
      user.password = await bcrypt.hash(newPassword, 10);
      user.mustChangePassword = false;
    }

    // Update profile fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (typeof pushNotificationsEnabled === 'boolean') {
      user.pushNotificationsEnabled = pushNotificationsEnabled;
    }

    await user.save();

    // Also update in auth database if pushNotificationsEnabled changed
    if (typeof pushNotificationsEnabled === 'boolean') {
      try {
        const db = await getAuthDatabase();
        await db.collection('v5users').updateOne(
          { email: user.email.toLowerCase() },
          { $set: { pushNotificationsEnabled } }
        );
      } catch (e) {
        console.error('Failed to sync notification preference to auth db:', e);
      }
    }

    // Log the profile update
    try {
      await ActivityLog.create({
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'update_user',
        entityType: 'user',
        entityId: user._id.toString(),
        details: newPassword ? 'Updated profile and password' : 'Updated profile',
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        pushNotificationsEnabled: user.pushNotificationsEnabled ?? true,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
