import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { LocationVaultItem, Location, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import { encryptPassword } from '@/lib/utils/encryption';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - List vault items for a location
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();
    const { id: locationId } = await params;

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can access vault
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Not authorized. Admin access required.' }, { status: 403 });
    }

    await connectDB();

    // Verify location exists
    const location = await Location.findById(locationId);
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    // Build query
    const query: Record<string, unknown> = {
      locationId,
      isActive: true,
    };
    if (type && type !== 'all') {
      query.type = type;
    }

    const items = await LocationVaultItem.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Map items to hide sensitive data
    const safeItems = items.map(item => ({
      ...item,
      // Replace encrypted passwords with flags
      password: undefined,
      emailPassword: undefined,
      hasPassword: !!item.password,
      hasEmailPassword: !!item.emailPassword,
    }));

    return NextResponse.json(safeItems);
  } catch (error) {
    console.error('Get vault items error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

// POST - Create a new vault item
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();
    const { id: locationId } = await params;

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can create vault items
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Not authorized. Admin access required.' }, { status: 403 });
    }

    await connectDB();

    // Verify location exists
    const location = await Location.findById(locationId);
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    const body = await request.json();
    const { type, title, password, emailPassword, ...rest } = body;

    // Validate required fields
    if (!type || !title) {
      return NextResponse.json({ error: 'Type and title are required' }, { status: 400 });
    }

    // Validate type
    const validTypes = ['bill', 'contract', 'email_account', 'password', 'note', 'document'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Encrypt sensitive fields
    const encryptedData: Record<string, string> = {};
    if (password) {
      encryptedData.password = encryptPassword(password);
    }
    if (emailPassword) {
      encryptedData.emailPassword = encryptPassword(emailPassword);
    }

    // Create vault item
    const vaultItem = await LocationVaultItem.create({
      locationId,
      type,
      title,
      ...rest,
      ...encryptedData,
      createdBy: currentUser.userId,
      createdByName: currentUser.name,
    });

    // Log activity
    try {
      await ActivityLog.create({
        locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'create_vault_item',
        entityType: 'vault_item',
        entityId: vaultItem._id.toString(),
        details: `Created vault item: ${title} (${type})`,
        metadata: { type, title },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Return item without sensitive data
    const safeItem = {
      ...vaultItem.toObject(),
      password: undefined,
      emailPassword: undefined,
      hasPassword: !!password,
      hasEmailPassword: !!emailPassword,
    };

    return NextResponse.json(safeItem, { status: 201 });
  } catch (error) {
    console.error('Create vault item error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
