import { NextRequest, NextResponse } from 'next/server';

// App version configuration
// Update these when you release a new version
const APP_CONFIG = {
  // Minimum required version (users below this MUST update)
  minVersion: '1.0.0',
  // Latest available version
  latestVersion: '1.0.0',
  // Update URLs
  ios: {
    // This will be the itms-services URL for OTA installation
    updateUrl: 'itms-services://?action=download-manifest&url=https://cloud.homation.us/api/app-version/manifest.plist',
    // Direct IPA URL (for reference)
    ipaUrl: 'https://cloud.homation.us/api/uploads/app/Laundromat.ipa',
  },
  android: {
    // Direct APK download URL
    updateUrl: 'https://cloud.homation.us/api/uploads/app/Laundromat.apk',
  },
  // Update message
  updateMessage: 'A new version of the app is available. Please update to continue using the app.',
  // Whether update is mandatory
  forceUpdate: true,
};

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

// GET - Check app version
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currentVersion = searchParams.get('version');
  const platform = searchParams.get('platform'); // 'ios' or 'android'

  // If no version provided, return config
  if (!currentVersion) {
    return NextResponse.json({
      minVersion: APP_CONFIG.minVersion,
      latestVersion: APP_CONFIG.latestVersion,
      forceUpdate: APP_CONFIG.forceUpdate,
      updateMessage: APP_CONFIG.updateMessage,
      ios: APP_CONFIG.ios,
      android: APP_CONFIG.android,
    });
  }

  // Check if update is required
  const needsUpdate = compareVersions(currentVersion, APP_CONFIG.minVersion) < 0;
  const updateAvailable = compareVersions(currentVersion, APP_CONFIG.latestVersion) < 0;

  const response: Record<string, unknown> = {
    currentVersion,
    minVersion: APP_CONFIG.minVersion,
    latestVersion: APP_CONFIG.latestVersion,
    needsUpdate,
    updateAvailable,
    forceUpdate: APP_CONFIG.forceUpdate && needsUpdate,
    updateMessage: APP_CONFIG.updateMessage,
  };

  // Add platform-specific update URL
  if (platform === 'ios') {
    response.updateUrl = APP_CONFIG.ios.updateUrl;
  } else if (platform === 'android') {
    response.updateUrl = APP_CONFIG.android.updateUrl;
  }

  return NextResponse.json(response);
}
