import { NextResponse } from 'next/server';
import { getAuthDatabase } from '@/lib/db/connection';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
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

    if (!isAdmin(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized. Admin access required.' },
        { status: 403 }
      );
    }

    const db = await getAuthDatabase();

    // Get the Laundromat Department
    const department = await db.collection('v5departments').findOne({ name: DEPARTMENT_NAME });

    if (!department) {
      return NextResponse.json(
        { error: 'Department not found' },
        { status: 404 }
      );
    }

    // Get all user IDs in the department
    const adminIds = department.adminIds || [];
    const memberIds = department.memberIds || [];
    const allUserIds = [...adminIds, ...memberIds];

    if (allUserIds.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all users in the department
    const userObjectIds: ObjectId[] = [];
    for (const id of allUserIds) {
      try {
        userObjectIds.push(new ObjectId(id));
      } catch {
        // Skip invalid IDs
      }
    }

    const users = await db.collection('v5users')
      .find({ _id: { $in: userObjectIds } })
      .project({ password: 0 })
      .toArray();

    // Map users with their department role
    const usersWithRoles = users.map(user => {
      const odId = user._id.toString();
      const isDeptAdmin = adminIds.includes(odId);
      return {
        _id: odId,
        email: user.email,
        name: user.name || '',
        firstName: user.name?.split(' ')[0] || '',
        lastName: user.name?.split(' ').slice(1).join(' ') || '',
        role: isDeptAdmin ? 'admin' : 'user',
        isActive: true,
        isSuperUser: user.isSuperUser || false,
      };
    });

    return NextResponse.json(usersWithRoles);
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
