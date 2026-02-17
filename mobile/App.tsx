import { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Platform, View, ActivityIndicator } from 'react-native';
import Constants from 'expo-constants';
import { AuthProvider } from './src/contexts/AuthContext';
import { LocationProvider } from './src/contexts/LocationContext';
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
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AuthProvider>
          <LocationProvider>
            <StatusBar style="auto" />
            <AppNavigator />
          </LocationProvider>
        </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
