import { NextRequest, NextResponse } from 'next/server';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import { ObjectId } from 'mongodb';

const DEPARTMENT_NAME = 'Laundromat Department';

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

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized. Admin access required.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const updates = await request.json();

    // First try to update in the app User model
    await connectDB();
    const appUser = await User.findById(id);

    if (appUser) {
      // Update in app User model
      if (updates.role) appUser.role = updates.role;
      if (updates.firstName) appUser.firstName = updates.firstName;
      if (updates.lastName) appUser.lastName = updates.lastName;
      if (updates.isActive !== undefined) appUser.isActive = updates.isActive;
      if (updates.isDriver !== undefined) appUser.isDriver = updates.isDriver;

      await appUser.save();

      return NextResponse.json({
        _id: appUser._id.toString(),
        email: appUser.email,
        name: `${appUser.firstName} ${appUser.lastName}`,
        firstName: appUser.firstName,
        lastName: appUser.lastName,
        role: appUser.role,
        isDriver: appUser.isDriver || false,
        isActive: appUser.isActive,
      });
    }

    // If not in app model, try auth database
    const db = await getAuthDatabase();
    const user = await db.collection('v5users').findOne({ _id: new ObjectId(id) });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get the department
    const department = await db.collection('v5departments').findOne({ name: DEPARTMENT_NAME });

    if (!department) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    }

    // Handle role change (move between adminIds and memberIds)
    if (updates.role !== undefined) {
      const adminIds = department.adminIds || [];
      const memberIds = department.memberIds || [];

      // Remove user from both arrays first
      const newAdminIds = adminIds.filter((aid: string) => aid !== id);
      const newMemberIds = memberIds.filter((mid: string) => mid !== id);

      // Add to appropriate array based on new role
      if (updates.role === 'admin' || updates.role === 'super_admin') {
        newAdminIds.push(id);
      } else {
        newMemberIds.push(id);
      }

      // Update the department
      await db.collection('v5departments').updateOne(
        { _id: department._id },
        {
          $set: {
            adminIds: newAdminIds,
            memberIds: newMemberIds,
            updatedAt: new Date()
          }
        }
      );
    }

    // Update isDriver on the user document in auth database
    if (updates.isDriver !== undefined) {
      await db.collection('v5users').updateOne(
        { _id: new ObjectId(id) },
        { $set: { isDriver: updates.isDriver, updatedAt: new Date() } }
      );
    }

    // Determine the user's current role after update
    const updatedDept = await db.collection('v5departments').findOne({ name: DEPARTMENT_NAME });
    const isNowAdmin = (updatedDept?.adminIds || []).includes(id);

    // Get updated isDriver value
    const updatedUser = await db.collection('v5users').findOne({ _id: new ObjectId(id) });

    return NextResponse.json({
      _id: id,
      email: user.email,
      name: user.name || '',
      firstName: user.name?.split(' ')[0] || '',
      lastName: user.name?.split(' ').slice(1).join(' ') || '',
      role: isNowAdmin ? 'admin' : updates.role || 'employee',
      isDriver: updatedUser?.isDriver || false,
      isActive: true,
      isSuperUser: user.isSuperUser || false,
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
        { error: 'Not authorized. Admin access required.' },
        { status: 403 }
      );
    }

    const db = await getAuthDatabase();
    const { id } = await params;

    // Prevent self-removal
    if (id === currentUser.userId) {
      return NextResponse.json(
        { error: 'Cannot remove yourself from the department' },
        { status: 400 }
      );
    }

    // Find the user
    const user = await db.collection('v5users').findOne({ _id: new ObjectId(id) });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get the department and remove user from both arrays
    const department = await db.collection('v5departments').findOne({ name: DEPARTMENT_NAME });

    if (!department) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    }

    const adminIds = (department.adminIds || []).filter((aid: string) => aid !== id);
    const memberIds = (department.memberIds || []).filter((mid: string) => mid !== id);

    await db.collection('v5departments').updateOne(
      { _id: department._id },
      {
        $set: {
          adminIds,
          memberIds,
          updatedAt: new Date()
        }
      }
    );

    return NextResponse.json({
      message: `User ${user.email} removed from Laundromat Department`
    });
  } catch (error) {
    console.error('Remove user error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
