import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { AppVersion } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import fs from 'fs/promises';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

// POST - Upload app file (IPA or APK) using multipart form
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    const formData = await request.formData();
    const platform = formData.get('platform') as string;
    const file = formData.get('file') as File;

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

    // Save file with standard name
    const standardName = platform === 'ios' ? 'Laundromat.ipa' : 'Laundromat.apk';
    const filePath = path.join(uploadDir, standardName);
    const relativePath = `app/${standardName}`;

    // Convert file to buffer and save
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

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

    return NextResponse.json({
      success: true,
      platform,
      path: relativePath,
      uploadedAt: now,
      fileSize: buffer.length,
    }, { status: 201 });
  } catch (error) {
    console.error('Upload app file error:', error);
    return NextResponse.json(
      { error: 'An error occurred during upload' },
      { status: 500 }
    );
  }
}
