import { NextResponse } from 'next/server';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { ObjectId } from 'mongodb';

const DEPARTMENT_NAME = 'Laundromat Department';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // First check if user exists in app User model
    await connectDB();
    const appUser = await User.findById(currentUser.userId).select('-password').lean();

    if (appUser) {
      return NextResponse.json({
        _id: appUser._id.toString(),
        email: appUser.email,
        firstName: appUser.firstName,
        lastName: appUser.lastName,
        role: appUser.role,
        isDriver: appUser.isDriver || false,
        isActive: appUser.isActive,
        isSuperUser: false,
      });
    }

    // Fall back to auth database
    const db = await getAuthDatabase();

    const user = await db.collection('v5users').findOne({
      _id: new ObjectId(currentUser.userId)
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get department info to determine role
    const department = await db.collection('v5departments').findOne({ name: DEPARTMENT_NAME });
    const userId = user._id.toString();
    const isSuperUser = user.isSuperUser || false;
    // Compare as strings to handle both ObjectId and string formats in the database
    const adminIds = department ? (department.adminIds || []).map((id: unknown) => id?.toString()) : [];
    const isAdmin = adminIds.includes(userId);
    const role = (isAdmin || isSuperUser) ? 'admin' : 'user';

    return NextResponse.json({
      _id: userId,
      email: user.email,
      firstName: user.name?.split(' ')[0] || '',
      lastName: user.name?.split(' ').slice(1).join(' ') || '',
      role: role,
      isDriver: user.isDriver || false,
      isActive: true,
      isSuperUser: isSuperUser,
      isDeptAdmin: isAdmin,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
