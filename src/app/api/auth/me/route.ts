import { NextResponse } from 'next/server';
import { getAuthDatabase } from '@/lib/db/connection';
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
