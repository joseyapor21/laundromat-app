#!/bin/bash
# Fix the LaundromatCallDirectory extension provisioning profile after EAS configure
# EAS assigns the wrong profile when both profiles share the same name

PBXPROJ="ios/Laundromat.xcodeproj/project.pbxproj"

if [ -f "$PBXPROJ" ]; then
  echo "[fix-extension-profile] Fixing extension provisioning profile in pbxproj..."

  # Replace PROVISIONING_PROFILE_SPECIFIER for the extension target
  # The extension should use UUID-based matching, not name-based
  # We find the LaundromatCallDirectory build settings and fix the profile

  # Use python to do a targeted fix
  python3 << 'PYEOF'
import re

pbxproj_path = "ios/Laundromat.xcodeproj/project.pbxproj"

with open(pbxproj_path, 'r') as f:
    content = f.read()

# Find all build configuration sections that have the calldirectory bundle ID
# and fix their PROVISIONING_PROFILE_SPECIFIER
lines = content.split('\n')
in_ext_section = False
fixed = 0

for i, line in enumerate(lines):
    # Detect if we're in a build settings block for the extension
    if 'com.laundromat.app.calldirectory' in line:
        in_ext_section = True

    if in_ext_section and '};' in line and 'buildSettings' not in line:
        in_ext_section = False

    # If we're in the extension section and find PROVISIONING_PROFILE_SPECIFIER, clear it
    if in_ext_section and 'PROVISIONING_PROFILE_SPECIFIER' in line:
        lines[i] = '\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "";'
        fixed += 1

content = '\n'.join(lines)

with open(pbxproj_path, 'w') as f:
    f.write(content)

print(f"[fix-extension-profile] Fixed {fixed} PROVISIONING_PROFILE_SPECIFIER entries for extension target")
PYEOF

  echo "[fix-extension-profile] Done."
else
  echo "[fix-extension-profile] No pbxproj found, skipping."
fi
