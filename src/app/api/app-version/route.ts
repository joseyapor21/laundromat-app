import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { AppVersion } from '@/lib/db/models';
import { getCurrentUser, isAdmin } from '@/lib/auth/server';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.homation.us';

// Compare semantic versions
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

// GET - Check app version (public endpoint)
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const currentVersion = searchParams.get('version');
    const platform = searchParams.get('platform');

    // Get or create app version config
    let config = await AppVersion.findOne();
    if (!config) {
      config = await AppVersion.create({
        minVersion: '1.0.0',
        latestVersion: '1.0.0',
        updateMessage: 'A new version of the app is available. Please update to continue using the app.',
        forceUpdate: false,
      });
    }

    const iosUpdateUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(`${BASE_URL}/api/app-version/manifest.plist`)}`;
    const androidUpdateUrl = config.androidApkPath
      ? `${BASE_URL}/api/uploads/${config.androidApkPath}`
      : `${BASE_URL}/api/uploads/app/Laundromat.apk`;

    // If no version provided, return full config (for admin)
    if (!currentVersion) {
      return NextResponse.json({
        minVersion: config.minVersion,
        latestVersion: config.latestVersion,
        updateMessage: config.updateMessage,
        forceUpdate: config.forceUpdate,
        iosIpaPath: config.iosIpaPath,
        iosIpaUploadedAt: config.iosIpaUploadedAt,
        androidApkPath: config.androidApkPath,
        androidApkUploadedAt: config.androidApkUploadedAt,
        ios: { updateUrl: iosUpdateUrl },
        android: { updateUrl: androidUpdateUrl },
      });
    }

    // Check if update is required
    const needsUpdate = compareVersions(currentVersion, config.minVersion) < 0;
    const updateAvailable = compareVersions(currentVersion, config.latestVersion) < 0;

    const response: Record<string, unknown> = {
      currentVersion,
      minVersion: config.minVersion,
      latestVersion: config.latestVersion,
      needsUpdate,
      updateAvailable,
      forceUpdate: config.forceUpdate && needsUpdate,
      updateMessage: config.updateMessage,
    };

    // Add platform-specific update URL
    if (platform === 'ios') {
      response.updateUrl = iosUpdateUrl;
    } else if (platform === 'android') {
      response.updateUrl = androidUpdateUrl;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('App version check error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// PUT - Update app version config (admin only)
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { minVersion, latestVersion, updateMessage, forceUpdate } = body;

    let config = await AppVersion.findOne();
    if (!config) {
      config = new AppVersion({});
    }

    if (minVersion) config.minVersion = minVersion;
    if (latestVersion) config.latestVersion = latestVersion;
    if (updateMessage !== undefined) config.updateMessage = updateMessage;
    if (forceUpdate !== undefined) config.forceUpdate = forceUpdate;
    config.updatedBy = currentUser.userId;
    config.updatedByName = currentUser.name;

    await config.save();

    return NextResponse.json({
      success: true,
      config: {
        minVersion: config.minVersion,
        latestVersion: config.latestVersion,
        updateMessage: config.updateMessage,
        forceUpdate: config.forceUpdate,
      },
    });
  } catch (error) {
    console.error('Update app version error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

// POST - Upload app file (IPA or APK)
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

    const body = await request.json();
    const { platform, fileName, base64 } = body;

    if (!platform || !['ios', 'android'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform. Must be ios or android' }, { status: 400 });
    }

    if (!fileName || !base64) {
      return NextResponse.json({ error: 'fileName and base64 are required' }, { status: 400 });
    }

    // Validate file extension
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

    // Decode and save
    const fileBuffer = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    await fs.writeFile(filePath, fileBuffer);

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
    }, { status: 201 });
  } catch (error) {
    console.error('Upload app file error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
