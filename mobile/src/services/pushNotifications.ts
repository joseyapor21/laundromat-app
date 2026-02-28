import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

class PushNotificationService {
  private expoPushToken: string | null = null;
  private Notifications: typeof import('expo-notifications') | null = null;
  private isAvailable = false;
  private isRegistering = false; // Prevent concurrent registration attempts
  private hasRequestedPermission = false; // Track if we've already requested this session

  constructor() {
    // Try to load notifications module
    try {
      this.Notifications = require('expo-notifications');
      this.isAvailable = true;
      // Configure how notifications are handled when app is in foreground
      this.Notifications!.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch (e) {
      console.log('Push notifications not available (requires native build)');
      this.isAvailable = false;
    }
  }

  async registerForPushNotifications(): Promise<string | null> {
    if (!this.isAvailable || !this.Notifications) {
      console.log('Push notifications not available');
      return null;
    }

    // Prevent concurrent registration attempts (avoid permission loop)
    if (this.isRegistering) {
      console.log('Push notification registration already in progress');
      return this.expoPushToken;
    }

    // If we already have a token, return it
    if (this.expoPushToken) {
      return this.expoPushToken;
    }

    // Check if physical device
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    this.isRegistering = true;

    try {
      // Check current permission status first
      const { status: existingStatus } = await this.Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Only request if not already granted AND we haven't requested yet this session
      if (existingStatus !== 'granted') {
        if (this.hasRequestedPermission) {
          // Already requested this session and was denied, don't ask again
          console.log('Push notification permission already requested this session');
          return null;
        }
        this.hasRequestedPermission = true;
        const { status } = await this.Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted');
        return null;
      }

      // Get the Expo push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;

      if (!projectId) {
        console.log('No projectId found in app config - push notifications disabled');
        return null;
      }

      try {
        const tokenData = await this.Notifications.getExpoPushTokenAsync({
          projectId,
        });

        this.expoPushToken = tokenData.data;
        console.log('Expo Push Token:', this.expoPushToken);

        // Register token with backend
        await this.registerTokenWithBackend();

        return this.expoPushToken;
      } catch (tokenError: any) {
        // Handle FCM/Firebase not configured error on Android
        if (Platform.OS === 'android' && tokenError?.message?.includes('SENDER_ID')) {
          console.log('Push notifications require Firebase configuration on Android');
          return null;
        }
        throw tokenError;
      }
    } catch (error) {
      console.log('Push notifications not available:', error);
      return null;
    } finally {
      this.isRegistering = false;
    }
  }

  private async registerTokenWithBackend(): Promise<void> {
    if (!this.expoPushToken) return;

    try {
      const platform = Platform.OS as 'ios' | 'android';
      await api.registerPushToken(this.expoPushToken, platform);
      console.log('Push token registered with backend');
    } catch (error) {
      console.error('Failed to register push token with backend:', error);
    }
  }

  async unregisterPushNotifications(): Promise<void> {
    try {
      await api.unregisterPushToken();
      this.expoPushToken = null;
      console.log('Push token unregistered');
    } catch (error) {
      console.error('Failed to unregister push token:', error);
    }
  }

  getToken(): string | null {
    return this.expoPushToken;
  }

  // Configure Android notification channel
  async setupAndroidChannel(): Promise<void> {
    if (!this.isAvailable || !this.Notifications) return;

    if (Platform.OS === 'android') {
      try {
        // Delete old default channel if exists
        await this.Notifications.deleteNotificationChannelAsync('default').catch(() => {});

        // Create orders channel
        await this.Notifications.setNotificationChannelAsync('orders', {
          name: 'Order Updates',
          description: 'Notifications for new orders and status changes',
          importance: this.Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#2563eb',
          sound: 'default',
          enableVibrate: true,
          showBadge: true,
        });

        // Create default channel for other notifications
        await this.Notifications.setNotificationChannelAsync('default', {
          name: 'General',
          description: 'General notifications',
          importance: this.Notifications.AndroidImportance.HIGH,
          sound: 'default',
        });
      } catch (e) {
        console.log('Failed to setup Android channel:', e);
      }
    }
  }

  // Add listener for received notifications
  addNotificationReceivedListener(callback: (notification: any) => void) {
    if (!this.isAvailable || !this.Notifications) return null;
    return this.Notifications.addNotificationReceivedListener(callback);
  }

  // Add listener for notification responses (when user taps notification)
  addNotificationResponseListener(callback: (response: any) => void) {
    if (!this.isAvailable || !this.Notifications) return null;
    return this.Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
