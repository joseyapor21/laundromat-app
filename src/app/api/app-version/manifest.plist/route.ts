import { NextRequest, NextResponse } from 'next/server';

// iOS OTA Installation Manifest
// This is used by Safari to install the IPA via itms-services://
export async function GET(request: NextRequest) {
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>https://cloud.homation.us/api/uploads/app/Laundromat.ipa</string>
        </dict>
        <dict>
          <key>kind</key>
          <string>display-image</string>
          <key>url</key>
          <string>https://cloud.homation.us/api/uploads/app/icon-57.png</string>
        </dict>
        <dict>
          <key>kind</key>
          <string>full-size-image</string>
          <key>url</key>
          <string>https://cloud.homation.us/api/uploads/app/icon-512.png</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>com.laundromat.app</string>
        <key>bundle-version</key>
        <string>1.0.0</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>Laundromat</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;

  return new NextResponse(manifest, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
