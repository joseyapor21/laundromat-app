import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { getCurrentUser, isSupervisor } from '@/lib/auth/server';

export async function GET() {
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

    // Filter users based on role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {};

    // Supervisors can only see employees and drivers
    if (currentUser.role === 'supervisor') {
      query.role = { $in: ['employee', 'driver'] };
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(users.map(u => ({
      ...u,
      _id: u._id.toString(),
    })));
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
