import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { LocationVaultItem, ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import fs from 'fs/promises';
import path from 'path';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

// POST - Upload a document to a vault item
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();
    const { id: locationId, itemId } = await params;

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can upload documents
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
    const { fileName, fileType, base64 } = body;

    if (!fileName || !fileType || !base64) {
      return NextResponse.json({ error: 'fileName, fileType, and base64 are required' }, { status: 400 });
    }

    // Create directory structure
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const timestamp = now.getTime();
    const extension = fileName.split('.').pop() || 'bin';
    const safeFileName = `${itemId}_${timestamp}.${extension}`;
    const relativePath = `vault-documents/${yearMonth}/${safeFileName}`;

    const uploadDir = path.join(process.cwd(), 'uploads', 'vault-documents', yearMonth);
    await fs.mkdir(uploadDir, { recursive: true });

    // Save the file
    const fileBuffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const filePath = path.join(uploadDir, safeFileName);
    await fs.writeFile(filePath, fileBuffer);

    // Add document to vault item
    const document = {
      fileName,
      filePath: relativePath,
      fileType,
      uploadedAt: now,
      uploadedBy: currentUser.userId,
      uploadedByName: currentUser.name,
    };

    await LocationVaultItem.findByIdAndUpdate(itemId, {
      $push: { documents: document },
      updatedBy: currentUser.userId,
      updatedByName: currentUser.name,
      updatedAt: now,
    });

    // Log activity
    try {
      await ActivityLog.create({
        locationId,
        userId: currentUser.userId,
        userName: currentUser.name,
        action: 'upload_vault_document',
        entityType: 'vault_item',
        entityId: itemId,
        details: `Uploaded document "${fileName}" to vault item: ${item.title}`,
        metadata: { fileName, fileType },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({
      success: true,
      document,
    }, { status: 201 });
  } catch (error) {
    console.error('Upload vault document error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}

// DELETE - Remove a document from a vault item
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();
    const { id: locationId, itemId } = await params;

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admins can delete documents
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

    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('filePath');

    if (!filePath) {
      return NextResponse.json({ error: 'filePath query parameter is required' }, { status: 400 });
    }

    // Find the document
    const docIndex = item.documents?.findIndex(d => d.filePath === filePath);
    if (docIndex === undefined || docIndex === -1) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = item.documents![docIndex];

    // Delete the file
    try {
      const fullPath = path.join(process.cwd(), 'uploads', filePath);
      await fs.unlink(fullPath);
    } catch (fileError) {
      console.error('Failed to delete file:', filePath, fileError);
    }

    // Remove document from vault item
    await LocationVaultItem.findByIdAndUpdate(itemId, {
      $pull: { documents: { filePath } },
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
        action: 'delete_vault_document',
        entityType: 'vault_item',
        entityId: itemId,
        details: `Deleted document "${document.fileName}" from vault item: ${item.title}`,
        metadata: { fileName: document.fileName, filePath },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      });
    } catch (logError) {
      console.error('Failed to log activity:', logError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete vault document error:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
