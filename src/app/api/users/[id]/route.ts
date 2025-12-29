import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin, isSupervisor } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!isSupervisor(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;
    const updates = await request.json();

    const user = await User.findById(id);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent role escalation
    if (updates.role) {
      const highRoles = ['super_admin', 'admin'];
      if (highRoles.includes(updates.role) && !isAdmin(currentUser)) {
        return NextResponse.json(
          { error: 'Cannot assign admin roles' },
          { status: 403 }
        );
      }
    }

    // Update allowed fields
    if (updates.firstName !== undefined) user.firstName = updates.firstName;
    if (updates.lastName !== undefined) user.lastName = updates.lastName;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.isActive !== undefined) user.isActive = updates.isActive;

    // Handle password reset
    if (updates.resetPassword && updates.temporaryPassword) {
      user.password = updates.temporaryPassword;
      user.mustChangePassword = true;
    }

    await user.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_user',
        entityType: 'user',
        entityId: user._id.toString(),
        details: `Updated user ${user.email}`,
        metadata: { email: user.email, updates: Object.keys(updates) },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      _id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
    });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await params;

    // Prevent self-deletion
    if (id === currentUser.userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'delete_user',
        entityType: 'user',
        entityId: id,
        details: `Deleted user ${user.email}`,
        metadata: { email: user.email, role: user.role },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
