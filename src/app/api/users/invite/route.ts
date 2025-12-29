import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { User, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isSupervisor } from '@/lib/auth/server';

export async function POST(request: NextRequest) {
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

    const { email, firstName, lastName, role, temporaryPassword } = await request.json();

    // Validate required fields
    if (!email || !firstName || !lastName || !role || !temporaryPassword) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      );
    }

    // Create the new user
    const newUser = new User({
      email: email.toLowerCase(),
      password: temporaryPassword,
      firstName,
      lastName,
      role,
      mustChangePassword: true,
      createdBy: currentUser.userId,
    });

    await newUser.save();

    // Log the activity
    try {
      await ActivityLog.create({
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'create_user',
        entityType: 'user',
        entityId: newUser._id.toString(),
        details: `Invited user ${email} with role ${role}`,
        metadata: { email, role },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      message: 'User invited successfully',
      user: {
        _id: newUser._id.toString(),
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Invite user error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
