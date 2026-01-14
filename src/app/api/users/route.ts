import { NextResponse } from 'next/server';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
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

    // First, get users from the application User model (these have proper roles)
    await connectDB();
    const appUsers = await User.find({}).select('-password').lean();

    // Map app users to the response format
    const appUsersFormatted = appUsers.map(user => ({
      _id: user._id.toString(),
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isDriver: user.isDriver || false,
      isActive: user.isActive,
      source: 'app',
    }));

    // Also get users from the auth database for those not in the app database
    const db = await getAuthDatabase();
    const department = await db.collection('v5departments').findOne({ name: DEPARTMENT_NAME });

    if (department) {
      const adminIds = department.adminIds || [];
      const memberIds = department.memberIds || [];
      const allUserIds = [...adminIds, ...memberIds];

      // Get emails that are already in app users
      const appEmails = new Set(appUsersFormatted.map(u => u.email.toLowerCase()));

      // Fetch auth users
      const userObjectIds: ObjectId[] = [];
      for (const id of allUserIds) {
        try {
          userObjectIds.push(new ObjectId(id));
        } catch {
          // Skip invalid IDs
        }
      }

      if (userObjectIds.length > 0) {
        const authUsers = await db.collection('v5users')
          .find({ _id: { $in: userObjectIds } })
          .project({ password: 0 })
          .toArray();

        // Add auth users that are not in app users
        for (const user of authUsers) {
          if (!appEmails.has(user.email?.toLowerCase())) {
            const odId = user._id.toString();
            const isDeptAdmin = adminIds.includes(odId);
            appUsersFormatted.push({
              _id: odId,
              email: user.email,
              name: user.name || '',
              firstName: user.name?.split(' ')[0] || '',
              lastName: user.name?.split(' ').slice(1).join(' ') || '',
              role: isDeptAdmin ? 'admin' : 'employee',
              isDriver: user.isDriver || false,
              isActive: true,
              source: 'auth',
            });
          }
        }
      }
    }

    return NextResponse.json(appUsersFormatted);
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
