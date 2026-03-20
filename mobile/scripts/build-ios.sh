#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "=== Step 1: Install provisioning profiles ==="
PROFILES_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILES_DIR"

MAIN_UUID=$(security cms -D -i credentials/profile.mobileprovision 2>/dev/null | grep -A1 UUID | grep string | sed 's/.*<string>\(.*\)<\/string>/\1/')
EXT_UUID=$(security cms -D -i credentials/calldirectory_profile.mobileprovision 2>/dev/null | grep -A1 UUID | grep string | sed 's/.*<string>\(.*\)<\/string>/\1/')

cp credentials/profile.mobileprovision "$PROFILES_DIR/${MAIN_UUID}.mobileprovision"
cp credentials/calldirectory_profile.mobileprovision "$PROFILES_DIR/${EXT_UUID}.mobileprovision"

echo "Main profile UUID: $MAIN_UUID"
echo "Extension profile UUID: $EXT_UUID"

echo "=== Step 2: Prebuild ==="
npx expo prebuild --platform ios --clean

echo "=== Step 3: Install Pods ==="
cd ios
pod install
cd ..

echo "=== Step 4: Archive ==="
ARCHIVE_PATH="$HOME/Library/Developer/Xcode/Archives/Laundromat-$(date +%Y%m%d%H%M%S).xcarchive"

xcodebuild \
  -workspace ios/Laundromat.xcworkspace \
  -scheme Laundromat \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  archive \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM=RXXK9S5WF4

echo "=== Step 5: Export IPA ==="
cat > /tmp/ExportOptions.plist << EXPORTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>ad-hoc</string>
    <key>teamID</key>
    <string>RXXK9S5WF4</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>com.laundromat.app</key>
        <string>${MAIN_UUID}</string>
        <key>com.laundromat.app.calldirectory</key>
        <string>${EXT_UUID}</string>
    </dict>
</dict>
</plist>
EXPORTEOF

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist /tmp/ExportOptions.plist \
  -exportPath "$(pwd)"

echo "=== Build complete! ==="
echo "IPA: $(pwd)/Laundromat.ipa"
