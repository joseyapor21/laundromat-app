import { NextRequest, NextResponse } from 'next/server';
import { connectDB, getAuthDatabase } from '@/lib/db/connection';
import { User } from '@/lib/db/models';
import { createHash, createHmac, pbkdf2Sync } from 'crypto';
import { createToken, getTokenExpiry, setAuthCookie } from '@/lib/auth';

const DEPARTMENT_NAME = 'Laundromat Department';

function verifyPassword(storedPassword: string, providedPassword: string): boolean {
  // Handle old sha256$salt$hash format (uses HMAC-SHA256)
  if (storedPassword.startsWith('sha256$')) {
    try {
      const parts = storedPassword.split('$');
      if (parts.length === 3) {
        const [, salt, storedHash] = parts;
        const testHash = createHmac('sha256', salt).update(providedPassword).digest('hex');
        if (testHash === storedHash) {
          return true;
        }
      }
    } catch {
      // Continue to other methods
    }
  }

  // Handle pbkdf2:sha256 format
  if (storedPassword.startsWith('pbkdf2:sha256')) {
    try {
      const parts = storedPassword.split('$');
      if (parts.length === 3) {
        const [method, salt, storedHash] = parts;
        const iterations = parseInt(method.split(':')[2] || '150000');
        const testHash = pbkdf2Sync(providedPassword, salt, iterations, 32, 'sha256').toString('hex');
        if (testHash === storedHash) {
          return true;
        }
      }
    } catch {
      // Continue to other methods
    }
  }

  // Plain text comparison (fallback)
  if (storedPassword === providedPassword) {
    return true;
  }

  // Simple SHA256 hash comparison
  const hashedProvided = createHash('sha256').update(providedPassword).digest('hex');
  if (storedPassword === hashedProvided) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const db = await getAuthDatabase();
    const normalizedEmail = email.toLowerCase().trim();

    // Find user in shared v5users collection
    const user = await db.collection('v5users').findOne({ email: normalizedEmail });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    if (!verifyPassword(user.password, password)) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const userId = user._id.toString();

    // Check if user is SuperUser (they can access everything)
    const isSuperUser = user.isSuperUser || false;

    // Find the Laundromat Department
    const department = await db.collection('v5departments').findOne({ name: DEPARTMENT_NAME });

    if (!department) {
      return NextResponse.json(
        { error: 'Laundromat Department not configured. Please contact an administrator.' },
        { status: 500 }
      );
    }

    // Check if user is in the department (as admin or member) or is a SuperUser
    // Compare as strings to handle both ObjectId and string formats in the database
    const adminIds = (department.adminIds || []).map((id: unknown) => id?.toString());
    const memberIds = (department.memberIds || []).map((id: unknown) => id?.toString());
    const isAdmin = adminIds.includes(userId);
    const isMember = memberIds.includes(userId);
    const isInDepartment = isSuperUser || isAdmin || isMember;

    if (!isInDepartment) {
      return NextResponse.json({
        error: 'Access denied. You are not a member of the Laundromat Department.'
      }, { status: 403 });
    }

    // Check if user exists in app User model for proper role/isDriver
    await connectDB();
    const appUser = await User.findById(userId).select('-password').lean();

    // Determine role and isDriver from app User model if exists, otherwise from auth DB
    let role = 'user';
    let isDriver = false;

    if (appUser) {
      // Use role and isDriver from app User model
      role = appUser.role || 'user';
      isDriver = appUser.isDriver || false;
    } else {
      // Fall back to auth database fields
      if (isAdmin || isSuperUser) {
        role = 'admin';
      } else if (user.appRole) {
        role = user.appRole;
      }
      isDriver = user.isDriver || false;
    }

    // Create JWT token with user info
    const userPayload = {
      _id: userId,
      email: user.email,
      firstName: appUser?.firstName || user.name?.split(' ')[0] || '',
      lastName: appUser?.lastName || user.name?.split(' ').slice(1).join(' ') || '',
      role: role,
      isDriver: isDriver,
      isActive: true,
      isSuperUser: isSuperUser,
      isDeptAdmin: isAdmin,
    };

    const token = await createToken(userPayload);

    // Set the auth cookie
    await setAuthCookie(token);

    return NextResponse.json({
      token,
      expiresAt: getTokenExpiry().toISOString(),
      user: userPayload,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
