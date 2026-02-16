import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { LocationVaultItem, Location, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import { encryptPassword, decryptPassword } from '@/lib/utils/encryption';
import fs from 'fs/promises';
import path from 'path';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

// GET - Get a single vault item (with optional password reveal)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();
    const { id: locationId, itemId } = await params;

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can access vault
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Not authorized. Admin access required.' }, { status: 403 });
    }

    await connectDB();

    const item = await LocationVaultItem.findOne({
      _id: itemId,
      locationId,
      isActive: true,
    }).lean();

    if (!item) {
      return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
    }

    // Check if password reveal is requested
    const { searchParams } = new URL(request.url);
    const reveal = searchParams.get('reveal') === 'true';

    if (reveal) {
      // Log password reveal for audit
      try {
        await ActivityLog.create({
          locationId,
          userId: currentUser.userId,
          userName: currentUser.name,
          action: 'reveal_vault_password',
          entityType: 'vault_item',
          entityId: itemId,
          details: `Revealed password for vault item: ${item.title}`,
          metadata: { type: item.type, title: item.title },
          ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        });
      } catch (logError) {
        console.error('Failed to log activity:', logError);
      }

      // Return decrypted passwords
      return NextResponse.json({
        password: item.password ? decryptPassword(item.password) : undefined,
        emailPassword: item.emailPassword ? decryptPassword(item.emailPassword) : undefined,
      });
    }

    // Return item without sensitive data
    return NextResponse.json({
      ...item,
      password: undefined,
      emailPassword: undefined,
      hasPassword: !!item.password,
      hasEmailPassword: !!item.emailPassword,
    });
  } catch (error) {
    console.error('Get vault item error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

// PUT - Update a vault item
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();
    const { id: locationId, itemId } = await params;

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can update vault items
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Not authorized. Admin access required.' }, { status: 403 });
    }

    await connectDB();

    const item = await LocationVaultItem.findOne({
      _id: itemId,
      locationId,
      isActive: true,
    });

    if (!item) {
      return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
    }

    const body = await request.json();
    const { password, emailPassword, ...rest } = body;

    // Build update object
    const updateData: Record<string, unknown> = {
      ...rest,
      updatedBy: currentUser.userId,
      updatedByName: currentUser.name,
      updatedAt: new Date(),
    };

    // Encrypt sensitive fields if provided
    if (password !== undefined) {
      updateData.password = password ? encryptPassword(password) : '';
    }
    if (emailPassword !== undefined) {
      updateData.emailPassword = emailPassword ? encryptPassword(emailPassword) : '';
    }

    // Update item
    const updatedItem = await LocationVaultItem.findByIdAndUpdate(
      itemId,
      updateData,
      { new: true }
    ).lean();

    // Log activity
    try {
      await ActivityLog.create({
        locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'update_vault_item',
        entityType: 'vault_item',
        entityId: itemId,
        details: `Updated vault item: ${updatedItem?.title}`,
        metadata: { type: updatedItem?.type, title: updatedItem?.title },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    // Return item without sensitive data
    return NextResponse.json({
      ...updatedItem,
      password: undefined,
      emailPassword: undefined,
      hasPassword: !!updatedItem?.password,
      hasEmailPassword: !!updatedItem?.emailPassword,
    });
  } catch (error) {
    console.error('Update vault item error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

// DELETE - Soft delete a vault item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();
    const { id: locationId, itemId } = await params;

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can delete vault items
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Not authorized. Admin access required.' }, { status: 403 });
    }

    await connectDB();

    const item = await LocationVaultItem.findOne({
      _id: itemId,
      locationId,
      isActive: true,
    });

    if (!item) {
      return NextResponse.json({ error: 'Vault item not found' }, { status: 404 });
    }

    // Delete associated document files
    if (item.documents && item.documents.length > 0) {
      for (const doc of item.documents) {
        try {
          const filePath = path.join(process.cwd(), 'uploads', doc.filePath);
          await fs.unlink(filePath);
        } catch (fileError) {
          console.error('Failed to delete file:', doc.filePath, fileError);
        }
      }
    }

    // Soft delete
    await LocationVaultItem.findByIdAndUpdate(itemId, {
      isActive: false,
      updatedBy: currentUser.userId,
      updatedByName: currentUser.name,
      updatedAt: new Date(),
    });

    // Log activity
    try {
      await ActivityLog.create({
        locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'delete_vault_item',
        entityType: 'vault_item',
        entityId: itemId,
        details: `Deleted vault item: ${item.title}`,
        metadata: { type: item.type, title: item.title },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete vault item error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
