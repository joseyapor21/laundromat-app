import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

class PushNotificationService {
  private expoPushToken: string | null = null;
  private Notifications: typeof import('expo-notifications') | null = null;
  private isAvailable = false;

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

    // Check if physical device
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    try {
      // Check/request permissions
      const { status: existingStatus } = await this.Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
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
        console.error('No projectId found in app config');
        return null;
      }

      const tokenData = await this.Notifications.getExpoPushTokenAsync({
        projectId,
      });

      this.expoPushToken = tokenData.data;
      console.log('Expo Push Token:', this.expoPushToken);

      // Register token with backend
      await this.registerTokenWithBackend();

      return this.expoPushToken;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
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
