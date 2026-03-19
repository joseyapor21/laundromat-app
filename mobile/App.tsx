import { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Platform, View, ActivityIndicator, TextInput } from 'react-native';
import Constants from 'expo-constants';

// Disable autocorrect, spellcheck, and dictation globally for all TextInputs
const originalRender = (TextInput as any).render;
if (originalRender) {
  (TextInput as any).render = function (props: any, ref: any) {
    return originalRender.call(this, {
      autoCorrect: false,
      spellCheck: false,
      autoComplete: 'off' as any,
      ...props,
    }, ref);
  };
} else {
  // Fallback: set defaultProps
  (TextInput as any).defaultProps = {
    ...(TextInput as any).defaultProps,
    autoCorrect: false,
    spellCheck: false,
    autoComplete: 'off',
  };
}
import { AuthProvider } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { DriverTrackingProvider } from './src/contexts/DriverTrackingContext';
import AppNavigator from './src/navigation/AppNavigator';
import UpdateRequiredScreen from './src/screens/UpdateRequiredScreen';

// Get current app version from app.json
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const API_BASE_URL = 'https://cloud.homation.us';

interface UpdateInfo {
  needsUpdate: boolean;
  forceUpdate: boolean;
  latestVersion: string;
  updateMessage: string;
  updateUrl: string;
}

export default function App() {
  const [checking, setChecking] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const platform = Platform.OS;
      const response = await fetch(
        `${API_BASE_URL}/api/app-version?version=${APP_VERSION}&platform=${platform}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.forceUpdate) {
          setUpdateInfo({
            needsUpdate: true,
            forceUpdate: true,
            latestVersion: data.latestVersion,
            updateMessage: data.updateMessage,
            updateUrl: data.updateUrl,
          });
        } else {
          setUpdateInfo(null);
        }
      }
    } catch (error) {
      console.log('Update check failed:', error);
      // Don't block the app if update check fails
      setUpdateInfo(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  // Show loading while checking for updates
  if (checking) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaProvider>
    );
  }

  // Show update required screen if force update is needed
  if (updateInfo?.forceUpdate) {
    return (
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <UpdateRequiredScreen
          currentVersion={APP_VERSION}
          latestVersion={updateInfo.latestVersion}
          updateMessage={updateInfo.updateMessage}
          updateUrl={updateInfo.updateUrl}
          onRetry={checkForUpdates}
          onBypass={() => setUpdateInfo(null)}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AuthProvider>
          <LocationProvider>
            <DriverTrackingProvider>
              <StatusBar style="auto" />
              <AppNavigator />
            </DriverTrackingProvider>
          </LocationProvider>
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
