/**
 * withCallerID.js
 *
 * Expo Config Plugin that wires up the native CallerID module and the
 * LaundromatCallDirectory Call Directory Extension into the Xcode project.
 *
 * What it does:
 *  a) Adds App Groups entitlement to the main app target.
 *  b) Writes the Objective-C native module files (CallerIDModule.h / .m) if
 *     they are not already present.
 *  c) Writes the Call Directory Extension files (CallDirectoryHandler.swift,
 *     Info.plist, LaundromatCallDirectory.entitlements) if not already present.
 *  d) Patches the .pbxproj so that:
 *       - CallerIDModule.m is compiled in the main target's Sources phase.
 *       - A new app_extension target "LaundromatCallDirectory" exists with the
 *         correct bundle ID, Swift version, team, entitlements, and CallKit
 *         framework linkage.
 *       - An "Embed App Extensions" copy-files build phase embeds the extension
 *         .appex into the main app.
 */

const {
  withEntitlementsPlist,
  withXcodeProject,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const APP_GROUP_ID = 'group.com.laundromat.app';
const EXT_BUNDLE_ID = 'com.laundromat.app.calldirectory';
const EXT_TARGET_NAME = 'LaundromatCallDirectory';
const EXT_DIR = 'LaundromatCallDirectory';
const MAIN_MODULE_DIR = 'Laundromat';
const TEAM_ID = 'RXXK9S5WF4';

// ---------------------------------------------------------------------------
// Embedded file contents
// ---------------------------------------------------------------------------

const CALLER_ID_MODULE_H = `#import <React/RCTBridgeModule.h>

@interface CallerIDModule : NSObject <RCTBridgeModule>

@end
`;

const CALLER_ID_MODULE_M = `#import "CallerIDModule.h"
#import <React/RCTLog.h>
#import <CallKit/CallKit.h>

static NSString *const kAppGroupID = @"group.com.laundromat.app";
static NSString *const kExtensionBundleID = @"com.laundromat.app.calldirectory";
static NSString *const kContactsKey = @"callerID_contacts";
static NSString *const kLastCallKey = @"callerID_lastCall";

@implementation CallerIDModule

RCT_EXPORT_MODULE(CallerIDModule);

RCT_EXPORT_METHOD(syncCustomers:(NSArray *)customers
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSArray *sorted = [customers sortedArrayUsingComparator:^NSComparisonResult(id obj1, id obj2) {
      NSDictionary *c1 = (NSDictionary *)obj1;
      NSDictionary *c2 = (NSDictionary *)obj2;
      NSString *phone1 = [c1[@"phoneNumber"] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] ?: @"";
      NSString *phone2 = [c2[@"phoneNumber"] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] ?: @"";
      NSCharacterSet *nonDigits = [[NSCharacterSet decimalDigitCharacterSet] invertedSet];
      NSString *digits1 = [[phone1 componentsSeparatedByCharactersInSet:nonDigits] componentsJoinedByString:@""];
      NSString *digits2 = [[phone2 componentsSeparatedByCharactersInSet:nonDigits] componentsJoinedByString:@""];
      long long num1 = [digits1 longLongValue];
      long long num2 = [digits2 longLongValue];
      if (num1 < num2) return NSOrderedAscending;
      if (num1 > num2) return NSOrderedDescending;
      return NSOrderedSame;
    }];

    NSError *serializeError = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:sorted options:0 error:&serializeError];
    if (serializeError) {
      reject(@"SERIALIZE_ERROR", serializeError.localizedDescription, serializeError);
      return;
    }

    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:kAppGroupID];
    if (!defaults) {
      reject(@"APP_GROUP_ERROR", @"Could not access App Group UserDefaults.", nil);
      return;
    }
    [defaults setObject:jsonData forKey:kContactsKey];
    [defaults synchronize];

    NSInteger syncedCount = (NSInteger)sorted.count;

    CXCallDirectoryManager *manager = [CXCallDirectoryManager sharedInstance];
    [manager reloadExtensionWithIdentifier:kExtensionBundleID
                         completionHandler:^(NSError * _Nullable error) {
      if (error) {
        RCTLogWarn(@"[CallerIDModule] Extension reload failed: %@", error.localizedDescription);
        resolve(@{ @"synced": @(syncedCount), @"reloaded": @NO, @"reloadError": error.localizedDescription });
      } else {
        resolve(@{ @"synced": @(syncedCount), @"reloaded": @YES });
      }
    }];
  } @catch (NSException *exception) {
    reject(@"SYNC_ERROR", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(getExtensionStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  CXCallDirectoryManager *manager = [CXCallDirectoryManager sharedInstance];
  [manager getEnabledStatusForExtensionWithIdentifier:kExtensionBundleID
                                    completionHandler:^(CXCallDirectoryEnabledStatus enabledStatus, NSError * _Nullable error) {
    if (error) {
      resolve(@{ @"status": @"unknown" });
      return;
    }
    NSString *statusString;
    switch (enabledStatus) {
      case CXCallDirectoryEnabledStatusEnabled:  statusString = @"enabled";  break;
      case CXCallDirectoryEnabledStatusDisabled: statusString = @"disabled"; break;
      default:                                   statusString = @"unknown";  break;
    }
    resolve(@{ @"status": statusString });
  }];
}

RCT_EXPORT_METHOD(openSettings:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *settingsURL = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
    if (settingsURL && [[UIApplication sharedApplication] canOpenURL:settingsURL]) {
      [[UIApplication sharedApplication] openURL:settingsURL options:@{} completionHandler:^(BOOL success) {
        resolve(@(success));
      }];
    } else {
      resolve(@NO);
    }
  });
}

RCT_EXPORT_METHOD(hasRecentIncomingCall:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:kAppGroupID];
  if (!defaults) { resolve(@NO); return; }
  double timestamp = [defaults doubleForKey:kLastCallKey];
  if (timestamp == 0) { resolve(@NO); return; }
  NSTimeInterval now = [[NSDate date] timeIntervalSince1970];
  resolve(@((now - timestamp) <= 300.0));
}

RCT_EXPORT_METHOD(clearRecentCall:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:kAppGroupID];
  if (defaults) {
    [defaults removeObjectForKey:kLastCallKey];
    [defaults synchronize];
  }
  resolve(nil);
}

@end
`;

const CALL_DIRECTORY_HANDLER_SWIFT = `import Foundation
import CallKit

class CallDirectoryHandler: CXCallDirectoryProvider {

    private let appGroupID = "group.com.laundromat.app"
    private let contactsKey = "callerID_contacts"

    override func beginRequest(with context: CXCallDirectoryExtensionContext) {
        context.delegate = self
        addIdentificationEntries(to: context)
        context.completeRequest()
    }

    private func addIdentificationEntries(to context: CXCallDirectoryExtensionContext) {
        guard
            let defaults = UserDefaults(suiteName: appGroupID),
            let jsonData = defaults.data(forKey: contactsKey),
            let contacts = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]]
        else { return }

        for contact in contacts {
            guard
                let rawPhone = contact["phoneNumber"] as? String,
                let name = contact["name"] as? String,
                !name.isEmpty
            else { continue }

            let digits = rawPhone.unicodeScalars
                .filter { CharacterSet.decimalDigits.contains($0) }
                .map { Character($0) }
            let digitsString = String(digits)
            guard !digitsString.isEmpty, let phoneNumber = Int64(digitsString) else { continue }

            context.addIdentificationEntry(withNextSequentialPhoneNumber: phoneNumber, label: name)
        }
    }
}

extension CallDirectoryHandler: CXCallDirectoryExtensionContextDelegate {
    func requestFailed(for extensionContext: CXCallDirectoryExtensionContext, withError error: Error) {}
}
`;

const EXTENSION_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>$(DEVELOPMENT_LANGUAGE)</string>
\t<key>CFBundleDisplayName</key>
\t<string>LaundromatCallDirectory</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>XPC!</string>
\t<key>CFBundleShortVersionString</key>
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>$(CURRENT_PROJECT_VERSION)</string>
\t<key>NSExtension</key>
\t<dict>
\t\t<key>NSExtensionPointIdentifier</key>
\t\t<string>com.apple.callkit.call-directory</string>
\t\t<key>NSExtensionPrincipalClass</key>
\t\t<string>$(PRODUCT_MODULE_NAME).CallDirectoryHandler</string>
\t</dict>
</dict>
</plist>
`;

const EXTENSION_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.security.application-groups</key>
\t<array>
\t\t<string>group.com.laundromat.app</string>
\t</array>
</dict>
</plist>
`;

// ---------------------------------------------------------------------------
// Helper – write a file only if it doesn't already exist
// ---------------------------------------------------------------------------
function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[withCallerID] Created: ${filePath}`);
  }
}

// ---------------------------------------------------------------------------
// Helper – generate a deterministic-enough UUID for pbxproj entries.
// The xcode npm package also generates UUIDs internally; we only need these
// for file references we add ourselves.
// ---------------------------------------------------------------------------
function generateUUID() {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).substring(0, 24);
}

// ---------------------------------------------------------------------------
// a) Entitlements – add App Groups to the main app
// ---------------------------------------------------------------------------
function withAppGroupEntitlements(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const entitlements = cfg.modResults;

    const existingGroups = entitlements['com.apple.security.application-groups'];
    if (Array.isArray(existingGroups)) {
      if (!existingGroups.includes(APP_GROUP_ID)) {
        existingGroups.push(APP_GROUP_ID);
      }
    } else {
      entitlements['com.apple.security.application-groups'] = [APP_GROUP_ID];
    }

    return cfg;
  });
}

// ---------------------------------------------------------------------------
// b) & c) & d) Xcode project manipulation
// ---------------------------------------------------------------------------
function withCallerIDXcodeProject(config) {
  return withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const projectRoot = cfg.modRequest.projectRoot;
    const iosDir = path.join(projectRoot, 'ios');

    // ------------------------------------------------------------------
    // 1. Write native source files to disk (if missing)
    // ------------------------------------------------------------------
    writeIfMissing(
      path.join(iosDir, MAIN_MODULE_DIR, 'CallerIDModule.h'),
      CALLER_ID_MODULE_H
    );
    writeIfMissing(
      path.join(iosDir, MAIN_MODULE_DIR, 'CallerIDModule.m'),
      CALLER_ID_MODULE_M
    );
    writeIfMissing(
      path.join(iosDir, EXT_DIR, 'CallDirectoryHandler.swift'),
      CALL_DIRECTORY_HANDLER_SWIFT
    );
    writeIfMissing(
      path.join(iosDir, EXT_DIR, 'Info.plist'),
      EXTENSION_INFO_PLIST
    );
    writeIfMissing(
      path.join(iosDir, EXT_DIR, 'LaundromatCallDirectory.entitlements'),
      EXTENSION_ENTITLEMENTS
    );

    // ------------------------------------------------------------------
    // 2. Find the main app target UUID
    // ------------------------------------------------------------------
    const nativeTargets = xcodeProject.pbxNativeTargetSection();
    let mainTargetKey = null;
    for (const [key, target] of Object.entries(nativeTargets)) {
      if (key.endsWith('_comment')) continue;
      if (target.name === 'Laundromat' && target.productType === '"com.apple.product-type.application"') {
        mainTargetKey = key;
        break;
      }
    }

    if (!mainTargetKey) {
      // Fallback: pick the first application target
      for (const [key, target] of Object.entries(nativeTargets)) {
        if (key.endsWith('_comment')) continue;
        if (target.productType === '"com.apple.product-type.application"') {
          mainTargetKey = key;
          break;
        }
      }
    }

    if (!mainTargetKey) {
      console.warn('[withCallerID] Could not find main application target in pbxproj. Skipping pbxproj edits.');
      return cfg;
    }

    const mainTarget = nativeTargets[mainTargetKey];

    // ------------------------------------------------------------------
    // 3. Add CallerIDModule.m to the main target's Sources build phase
    // ------------------------------------------------------------------
    const callerIDModuleMPath = `${MAIN_MODULE_DIR}/CallerIDModule.m`;

    // Check if already in the project's file references
    const fileRefsSection = xcodeProject.pbxFileReferenceSection();
    const alreadyHasModuleRef = Object.values(fileRefsSection).some(
      (ref) => ref && ref.path && ref.path.replace(/"/g, '') === callerIDModuleMPath
    );

    if (!alreadyHasModuleRef) {
      // addSourceFile(path, fileOptions, groupKey)
      // The second argument null means default options; third is the group.
      const mainGroupKey = xcodeProject.findPBXGroupKey({ name: 'Laundromat' });
      xcodeProject.addSourceFile(
        callerIDModuleMPath,
        { target: mainTargetKey },
        mainGroupKey || undefined
      );
      console.log('[withCallerID] Added CallerIDModule.m to main target sources.');
    } else {
      console.log('[withCallerID] CallerIDModule.m already in project, skipping.');
    }

    // ------------------------------------------------------------------
    // 4. Check if LaundromatCallDirectory target already exists
    // ------------------------------------------------------------------
    const extTargetAlreadyExists = Object.values(nativeTargets).some(
      (t) => t && t.name === EXT_TARGET_NAME
    );

    let extTargetKey;

    if (!extTargetAlreadyExists) {
      // ------------------------------------------------------------------
      // 5. Add the extension target
      // ------------------------------------------------------------------
      const extTarget = xcodeProject.addTarget(
        EXT_TARGET_NAME,
        'app_extension',
        EXT_DIR,
        EXT_BUNDLE_ID
      );

      extTargetKey = extTarget.uuid;
      console.log(`[withCallerID] Added extension target: ${EXT_TARGET_NAME} (${extTargetKey})`);

      // ------------------------------------------------------------------
      // 6. Add CallDirectoryHandler.swift to the extension target sources
      //    Directly manipulate pbxproj to avoid path-doubling issues.
      // ------------------------------------------------------------------
      const fileRefUUID = generateUUID();
      const buildFileUUID = generateUUID();
      const groupUUID = generateUUID();

      // PBXFileReference for the swift file
      const objects = xcodeProject.hash.project.objects;
      objects['PBXFileReference'] = objects['PBXFileReference'] || {};
      objects['PBXFileReference'][fileRefUUID] = {
        isa: 'PBXFileReference',
        lastKnownFileType: 'sourcecode.swift',
        path: '"CallDirectoryHandler.swift"',
        sourceTree: '"<group>"',
      };
      objects['PBXFileReference'][`${fileRefUUID}_comment`] = 'CallDirectoryHandler.swift';

      // PBXBuildFile linking the file ref
      objects['PBXBuildFile'] = objects['PBXBuildFile'] || {};
      objects['PBXBuildFile'][buildFileUUID] = {
        isa: 'PBXBuildFile',
        fileRef: fileRefUUID,
      };
      objects['PBXBuildFile'][`${buildFileUUID}_comment`] = 'CallDirectoryHandler.swift in Sources';

      // PBXGroup for the extension directory
      objects['PBXGroup'] = objects['PBXGroup'] || {};
      objects['PBXGroup'][groupUUID] = {
        isa: 'PBXGroup',
        children: [{ value: fileRefUUID, comment: 'CallDirectoryHandler.swift' }],
        name: `"${EXT_DIR}"`,
        path: `"${EXT_DIR}"`,
        sourceTree: '"<group>"',
      };
      objects['PBXGroup'][`${groupUUID}_comment`] = EXT_DIR;

      // Add group to main project group
      const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
      if (objects['PBXGroup'][mainGroupKey]) {
        objects['PBXGroup'][mainGroupKey].children =
          objects['PBXGroup'][mainGroupKey].children || [];
        objects['PBXGroup'][mainGroupKey].children.push(
          { value: groupUUID, comment: EXT_DIR }
        );
      }
      console.log('[withCallerID] Created PBX group for extension:', groupUUID);

      // Add buildFile to extension target's Sources build phase
      const extTargetObj = objects['PBXNativeTarget'][extTargetKey];
      if (extTargetObj && extTargetObj.buildPhases) {
        for (const phaseRef of extTargetObj.buildPhases) {
          const phaseKey = typeof phaseRef === 'object' ? phaseRef.value : phaseRef;
          const sourcePhase = (objects['PBXSourcesBuildPhase'] || {})[phaseKey];
          if (sourcePhase) {
            sourcePhase.files = sourcePhase.files || [];
            sourcePhase.files.push({ value: buildFileUUID, comment: 'CallDirectoryHandler.swift in Sources' });
            break;
          }
        }
      }
      console.log('[withCallerID] Added CallDirectoryHandler.swift to extension target.');

      // ------------------------------------------------------------------
      // 7. Add CallKit framework to the extension target
      // ------------------------------------------------------------------
      xcodeProject.addFramework('CallKit.framework', { target: extTargetKey });
      console.log('[withCallerID] Added CallKit.framework to extension target.');

      // ------------------------------------------------------------------
      // 8. Set extension build settings
      //    SWIFT_VERSION, DEVELOPMENT_TEAM, CODE_SIGN_ENTITLEMENTS,
      //    PRODUCT_BUNDLE_IDENTIFIER (belt-and-suspenders)
      // ------------------------------------------------------------------
      const extBuildConfigList = xcodeProject.pbxNativeTargetSection()[extTargetKey]
        && xcodeProject.pbxNativeTargetSection()[extTargetKey].buildConfigurationList;

      const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
      const configListSection = xcodeProject.pbxXCConfigurationList();

      if (extBuildConfigList && configListSection[extBuildConfigList]) {
        const configList = configListSection[extBuildConfigList];
        const buildConfigUUIDs = configList.buildConfigurations.map((c) =>
          typeof c === 'object' ? c.value : c
        );

        for (const uuid of buildConfigUUIDs) {
          const buildConfig = buildConfigs[uuid];
          if (buildConfig && buildConfig.buildSettings) {
            buildConfig.buildSettings['SWIFT_VERSION'] = '5.0';
            buildConfig.buildSettings['DEVELOPMENT_TEAM'] = TEAM_ID;
            buildConfig.buildSettings['PRODUCT_BUNDLE_IDENTIFIER'] =
              `"${EXT_BUNDLE_ID}"`;
            buildConfig.buildSettings['CURRENT_PROJECT_VERSION'] = '20';
            buildConfig.buildSettings['MARKETING_VERSION'] = '"1.0.7"';
            buildConfig.buildSettings['INFOPLIST_FILE'] =
              `"${EXT_DIR}/Info.plist"`;
            // CODE_SIGN_ENTITLEMENTS is added manually after registering App Groups
            // in Apple Developer Portal for com.laundromat.app.calldirectory
          }
        }
        console.log('[withCallerID] Applied build settings to extension target.');
      }

      // ------------------------------------------------------------------
      // 9. Add extension dependency to main target
      // ------------------------------------------------------------------
      const containerItemProxy = xcodeProject.addTargetDependency(mainTargetKey, [extTargetKey]);
      console.log('[withCallerID] Added target dependency from main → extension.');

      // Note: addTarget() already creates the "Embed App Extensions" CopyFiles build phase
      // automatically when type is 'app_extension'. No manual embed phase needed.
    } else {
      console.log(`[withCallerID] Extension target "${EXT_TARGET_NAME}" already exists, skipping target creation.`);
    }

    return cfg;
  });
}

// ---------------------------------------------------------------------------
// Main plugin export
// ---------------------------------------------------------------------------
module.exports = function withCallerID(config) {
  config = withAppGroupEntitlements(config);
  config = withCallerIDXcodeProject(config);
  return config;
};
