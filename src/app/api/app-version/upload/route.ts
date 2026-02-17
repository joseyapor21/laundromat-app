import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { AppVersion } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import fs from 'fs/promises';
import path from 'path';

// POST - Upload app file (IPA or APK) using multipart form
export async function POST(request: NextRequest) {
  try {
    console.log('Upload request received');

    const currentUser = await getCurrentUser();
    console.log('Current user:', currentUser?.email);

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();
    console.log('DB connected');

    const formData = await request.formData();
    const platform = formData.get('platform') as string;
    const file = formData.get('file') as File;

    console.log('Platform:', platform);
    console.log('File:', file?.name, file?.size);

    if (!platform || !['ios', 'android'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform. Must be ios or android' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file extension
    const fileName = file.name;
    const ext = fileName.split('.').pop()?.toLowerCase();

    if (platform === 'ios' && ext !== 'ipa') {
      return NextResponse.json({ error: 'iOS app must be an .ipa file' }, { status: 400 });
    }
    if (platform === 'android' && ext !== 'apk') {
      return NextResponse.json({ error: 'Android app must be an .apk file' }, { status: 400 });
    }

    // Create directory
    const uploadDir = path.join(process.cwd(), 'uploads', 'app');
    await fs.mkdir(uploadDir, { recursive: true });
    console.log('Upload dir:', uploadDir);

    // Save file with standard name
    const standardName = platform === 'ios' ? 'Laundromat.ipa' : 'Laundromat.apk';
    const filePath = path.join(uploadDir, standardName);
    const relativePath = `app/${standardName}`;

    // Convert file to buffer and save
    console.log('Reading file buffer...');
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('Buffer size:', buffer.length);

    await fs.writeFile(filePath, buffer);
    console.log('File written to:', filePath);

    // Update config
    let config = await AppVersion.findOne();
    if (!config) {
      config = new AppVersion({});
    }

    const now = new Date();
    if (platform === 'ios') {
      config.iosIpaPath = relativePath;
      config.iosIpaUploadedAt = now;
    } else {
      config.androidApkPath = relativePath;
      config.androidApkUploadedAt = now;
    }
    config.updatedBy = currentUser.userId;
    config.updatedByName = currentUser.name;

    await config.save();
    console.log('Config saved');

    return NextResponse.json({
      success: true,
      platform,
      path: relativePath,
      uploadedAt: now,
      fileSize: buffer.length,
    }, { status: 201 });
  } catch (error) {
    console.error('Upload app file error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Upload failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
