import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';
import { ObjectId } from 'mongodb';

const DEPARTMENT_NAME = 'Laundromat Department';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const headersList = await headers();
    const isKioskMode = headersList.get('x-is-kiosk-mode') === 'true';

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
        isKioskMode,
      });
    }

    // Fall back to auth database
    const db = await getAuthDatabase();

    // Check v5users first (regular login)
    let user = await db.collection('v5users').findOne({
      _id: new ObjectId(currentUser.userId)
    });

    // Also check users collection (kiosk PIN login)
    if (!user) {
      user = await db.collection('users').findOne({
        _id: new ObjectId(currentUser.userId)
      });
    }

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

    // Determine role: admin/super_admin if in adminIds, otherwise use stored appRole
    let role = 'user';
    if (isAdmin || isSuperUser) {
      role = 'admin';
    } else if (user.appRole) {
      role = user.appRole;
    }

    // Handle both v5users (has 'name') and users (has 'firstName'/'lastName') formats
    const firstName = user.firstName || user.name?.split(' ')[0] || '';
    const lastName = user.lastName || user.name?.split(' ').slice(1).join(' ') || '';

    return NextResponse.json({
      _id: userId,
      email: user.email,
      firstName,
      lastName,
      role: user.role || role,
      isDriver: user.isDriver || false,
      isActive: user.isActive !== false,
      isSuperUser: isSuperUser,
      isDeptAdmin: isAdmin,
      isKioskMode,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
