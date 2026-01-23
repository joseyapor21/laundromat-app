import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import fs from 'fs/promises';
import path from 'path';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

// GET - Serve uploaded files (protected)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { path: pathSegments } = await params;
    const relativePath = pathSegments.join('/');

    // Security: Only allow access to specific directories
    const allowedPrefixes = ['time-entries/', 'pickup-photos/'];
    const isAllowed = allowedPrefixes.some(prefix => relativePath.startsWith(prefix));

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // For time-entries, users can only see their own unless admin
    if (relativePath.startsWith('time-entries/') && !isAdmin(currentUser)) {
      // Extract userId from filename pattern: {userId}_{timestamp}_{type}.jpg
      const fileName = pathSegments[pathSegments.length - 1];
      const fileUserId = fileName.split('_')[0];
      if (fileUserId !== currentUser.userId) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    // Build full path
    const filePath = path.join(process.cwd(), 'uploads', relativePath);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read and serve file
    const fileBuffer = await fs.readFile(filePath);

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Serve file error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
