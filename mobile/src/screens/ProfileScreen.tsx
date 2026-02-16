import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Switch,
  FlatList,
  Vibration,
  AppState,
  AppStateStatus,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { useAuth } from '../contexts/AuthContext';
import { useTimeClock, BreakType } from '../contexts/TimeClockContext';
import { useLocation } from '../contexts/LocationContext';
import { api } from '../services/api';
import ClockInScreen from './ClockInScreen';
import type { Location as LocationType, Settings } from '../types';

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Break notification identifier
const BREAK_NOTIFICATION_ID = 'break-timer-alarm';

// Dynamically import push notifications
let pushNotificationService: {
  registerForPushNotifications: () => Promise<string | null>;
} | null = null;

try {
  pushNotificationService = require('../services/pushNotifications').pushNotificationService;
} catch (e) {
  console.log('Push notifications not available');
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout, refreshUser } = useAuth();
  const { isClockedIn, isOnBreak, breakType, lastClockIn, lastBreakStart, startBreak, endBreak, isLoading: isClockLoading } = useTimeClock();
  const { currentLocation, availableLocations, selectLocation, refreshLocations } = useLocation();

  // Clock out modal
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [isBreakLoading, setIsBreakLoading] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [breakTimeRemaining, setBreakTimeRemaining] = useState<number | null>(null);
  const [breakTimeExpired, setBreakTimeExpired] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [pausedTime, setPausedTime] = useState(0); // Total paused time in seconds
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const breakTimerRef = useRef<NodeJS.Timeout | null>(null);
  const alarmSoundRef = useRef<Audio.Sound | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Location picker modal
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Edit profile modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [saving, setSaving] = useState(false);

  // Change password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Push notification status
  const [pushStatus, setPushStatus] = useState<'checking' | 'enabled' | 'disabled' | 'unavailable'>('checking');
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(true);
  const [togglingPush, setTogglingPush] = useState(false);

  useEffect(() => {
    checkPushNotificationStatus();
    loadNotificationPreference();
    loadSettings();
    // Load locations if not already loaded
    if (availableLocations.length === 0) {
      refreshLocations();
    }
  }, []);

  // Load settings for break durations
  const loadSettings = async () => {
    try {
      const settingsData = await api.getSettings();
      setSettings(settingsData);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  // Schedule a local notification for when break time expires
  const scheduleBreakNotification = async (type: 'breakfast' | 'lunch', durationMinutes: number) => {
    try {
      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permissions not granted');
        return;
      }

      // Cancel any existing break notification first
      await cancelBreakNotification();

      // Schedule notification for when break time expires
      const triggerDate = new Date(Date.now() + durationMinutes * 60 * 1000);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${type === 'breakfast' ? 'Breakfast' : 'Lunch'} Break Time Up!`,
          body: `Your ${durationMinutes} minute ${type} break has ended. Please return to work.`,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 500, 200, 500, 200, 500],
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
        identifier: BREAK_NOTIFICATION_ID,
      });

      console.log(`Break notification scheduled for ${triggerDate.toLocaleTimeString()}`);
    } catch (error) {
      console.error('Failed to schedule break notification:', error);
    }
  };

  // Cancel the break notification
  const cancelBreakNotification = async () => {
    try {
      await Notifications.cancelScheduledNotificationAsync(BREAK_NOTIFICATION_ID);
      console.log('Break notification cancelled');
    } catch (error) {
      console.error('Failed to cancel break notification:', error);
    }
  };

  // Start continuous alarm sound
  const startAlarm = async () => {
    if (isAlarmPlaying) return;

    try {
      // Configure audio for alarm (plays even in silent mode)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Create and play the alarm sound
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/alarm.mp3'),
        { isLooping: true, volume: 1.0 }
      );

      alarmSoundRef.current = sound;
      await sound.playAsync();
      setIsAlarmPlaying(true);

      // Also vibrate continuously
      const vibrateLoop = () => {
        Vibration.vibrate([500, 300, 500, 300, 500], false);
      };
      vibrateLoop();
      alarmIntervalRef.current = setInterval(vibrateLoop, 2500);

      console.log('Alarm started');
    } catch (error) {
      console.error('Failed to start alarm:', error);
      // Fallback to just vibration if sound fails
      Vibration.vibrate([500, 200, 500, 200, 500, 200, 500], true);
      setIsAlarmPlaying(true);
    }
  };

  // Stop the alarm sound
  const stopAlarm = async () => {
    try {
      if (alarmSoundRef.current) {
        await alarmSoundRef.current.stopAsync();
        await alarmSoundRef.current.unloadAsync();
        alarmSoundRef.current = null;
      }
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
      Vibration.cancel();
      setIsAlarmPlaying(false);
      console.log('Alarm stopped');
    } catch (error) {
      console.error('Failed to stop alarm:', error);
    }
  };

  // Handle app state changes - start alarm when app comes to foreground if break expired
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && breakTimeExpired && !isAlarmPlaying) {
        startAlarm();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [breakTimeExpired, isAlarmPlaying]);

  // Listen for notification received (when app is in foreground)
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.identifier === BREAK_NOTIFICATION_ID) {
        // Break notification received - start alarm
        startAlarm();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Schedule notification with specific remaining seconds (for resume after pause)
  const scheduleBreakNotificationWithSeconds = async (type: 'breakfast' | 'lunch', remainingSeconds: number) => {
    try {
      if (remainingSeconds <= 0) return;

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permissions not granted');
        return;
      }

      await cancelBreakNotification();

      const triggerDate = new Date(Date.now() + remainingSeconds * 1000);
      const minutes = Math.ceil(remainingSeconds / 60);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${type === 'breakfast' ? 'Breakfast' : 'Lunch'} Break Time Up!`,
          body: `Your ${type} break has ended. Please return to work.`,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 500, 200, 500, 200, 500],
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
        identifier: BREAK_NOTIFICATION_ID,
      });

      console.log(`Break notification rescheduled for ${triggerDate.toLocaleTimeString()} (${remainingSeconds}s remaining)`);
    } catch (error) {
      console.error('Failed to reschedule break notification:', error);
    }
  };

  // Break timer effect
  useEffect(() => {
    if (isOnBreak && lastBreakStart && settings && !isTimerPaused) {
      const allowedMinutes = breakType === 'breakfast'
        ? (settings.breakfastDurationMinutes || 15)
        : (settings.lunchDurationMinutes || 30);

      const updateTimer = () => {
        // Calculate elapsed time minus any paused time
        const elapsed = Math.floor((Date.now() - lastBreakStart.getTime()) / 1000) - pausedTime;
        const allowed = allowedMinutes * 60;
        const remaining = allowed - elapsed;

        setBreakTimeRemaining(remaining);

        if (remaining <= 0 && !breakTimeExpired) {
          setBreakTimeExpired(true);
          // Start continuous alarm
          startAlarm();
          Alert.alert(
            'Break Time Expired',
            `Your ${breakType || 'break'} time of ${allowedMinutes} minutes has ended. Please end your break now.`,
            [{ text: 'OK' }]
          );
        }
      };

      updateTimer();
      breakTimerRef.current = setInterval(updateTimer, 1000);

      return () => {
        if (breakTimerRef.current) {
          clearInterval(breakTimerRef.current);
        }
      };
    } else if (!isOnBreak) {
      setBreakTimeRemaining(null);
      setBreakTimeExpired(false);
      setIsTimerPaused(false);
      setPausedTime(0);
      setPauseStartTime(null);
      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
      }
      // Stop alarm and cancel any scheduled break notification
      stopAlarm();
      cancelBreakNotification();
    }
  }, [isOnBreak, lastBreakStart, breakType, settings, breakTimeExpired, isTimerPaused, pausedTime]);

  const toggleTimerPause = async () => {
    if (isTimerPaused) {
      // Resume: add the paused duration to total paused time
      if (pauseStartTime) {
        const pausedDuration = Math.floor((Date.now() - pauseStartTime) / 1000);
        const newPausedTime = pausedTime + pausedDuration;
        setPausedTime(newPausedTime);

        // Reschedule notification with remaining time
        if (breakTimeRemaining !== null && breakTimeRemaining > 0 && settings) {
          const remainingSeconds = breakTimeRemaining;
          await scheduleBreakNotificationWithSeconds(breakType || 'lunch', remainingSeconds);
        }
      }
      setPauseStartTime(null);
      setIsTimerPaused(false);
    } else {
      // Pause: record when we started pausing and cancel notification
      setPauseStartTime(Date.now());
      setIsTimerPaused(true);
      await cancelBreakNotification();
    }
  };

  const loadNotificationPreference = async () => {
    try {
      const profile = await api.getProfile();
      setPushNotificationsEnabled(profile.pushNotificationsEnabled ?? true);
    } catch (e) {
      console.log('Failed to load notification preference');
    }
  };

  const checkPushNotificationStatus = async () => {
    if (!pushNotificationService) {
      setPushStatus('unavailable');
      return;
    }
    try {
      const token = await pushNotificationService.registerForPushNotifications();
      if (token) {
        setPushStatus('enabled');
      } else {
        setPushStatus('disabled');
      }
    } catch (e) {
      console.log('Push check error:', e);
      setPushStatus('unavailable');
    }
  };

  const handleTogglePushNotifications = async (value: boolean) => {
    setTogglingPush(true);
    try {
      await api.updateProfile({ pushNotificationsEnabled: value });
      setPushNotificationsEnabled(value);
      Alert.alert(
        'Success',
        value ? 'Push notifications enabled' : 'Push notifications disabled'
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update notification preference');
      // Revert the switch
      setPushNotificationsEnabled(!value);
    } finally {
      setTogglingPush(false);
    }
  };

  async function handleLogout() {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              console.error('Logout error:', error);
            }
          },
        },
      ]
    );
  }

  const handleStartBreak = async (type: 'breakfast' | 'lunch') => {
    setIsBreakLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required for break tracking');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        mayShowUserSettingsDialog: false,
      });

      // Get address via reverse geocoding
      let addressStr: string | undefined;
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (addresses.length > 0) {
          const addr = addresses[0];
          const parts = [];
          if (addr.streetNumber) parts.push(addr.streetNumber);
          if (addr.street) parts.push(addr.street);
          if (addr.city) parts.push(addr.city);
          if (addr.region) parts.push(addr.region);
          addressStr = parts.join(', ') || addr.name || undefined;
        }
      } catch (geoError) {
        console.error('Error reverse geocoding:', geoError);
      }

      const location = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy || undefined,
        address: addressStr,
      };

      const duration = type === 'breakfast'
        ? (settings?.breakfastDurationMinutes || 15)
        : (settings?.lunchDurationMinutes || 30);

      await startBreak({ location, breakType: type, notes: `${type} break` });

      // Schedule notification for when break time expires
      await scheduleBreakNotification(type, duration);

      Alert.alert(
        `${type.charAt(0).toUpperCase() + type.slice(1)} Break Started`,
        `You have ${duration} minutes for your ${type} break. You'll be notified when time is up.`
      );
    } catch (error: any) {
      console.error('Break error:', error);
      Alert.alert('Error', error.message || 'Failed to start break');
    } finally {
      setIsBreakLoading(false);
    }
  };

  const handleEndBreak = async () => {
    setIsBreakLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required for break tracking');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        mayShowUserSettingsDialog: false,
      });

      // Get address via reverse geocoding
      let addressStr: string | undefined;
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (addresses.length > 0) {
          const addr = addresses[0];
          const parts = [];
          if (addr.streetNumber) parts.push(addr.streetNumber);
          if (addr.street) parts.push(addr.street);
          if (addr.city) parts.push(addr.city);
          if (addr.region) parts.push(addr.region);
          addressStr = parts.join(', ') || addr.name || undefined;
        }
      } catch (geoError) {
        console.error('Error reverse geocoding:', geoError);
      }

      const location = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy || undefined,
        address: addressStr,
      };

      await endBreak({ location });

      // Stop the alarm if playing
      await stopAlarm();

      // Cancel the scheduled break notification
      await cancelBreakNotification();

      Alert.alert('Break Ended', 'Your break has been recorded.');
    } catch (error: any) {
      console.error('Break error:', error);
      Alert.alert('Error', error.message || 'Failed to end break');
    } finally {
      setIsBreakLoading(false);
    }
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return 'Time up!';
    const mins = Math.floor(Math.abs(seconds) / 60);
    const secs = Math.abs(seconds) % 60;
    const sign = seconds < 0 ? '-' : '';
    return `${sign}${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'supervisor': return 'Supervisor';
      case 'driver': return 'Driver';
      case 'cashier': return 'Cashier';
      case 'employee': return 'Employee';
      default: return 'User';
    }
  };

  const openEditModal = () => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Error', 'Please fill in both first and last name');
      return;
    }

    setSaving(true);
    try {
      // Note: You may need to implement a profile update endpoint
      Alert.alert('Info', 'Profile update requires backend support for /api/profile endpoint');
      setShowEditModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Error', 'Please enter your current password');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      // Note: You may need to implement a password change endpoint
      Alert.alert('Info', 'Password change requires backend support for /api/profile endpoint');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert('Error', 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const handleSwitchLocation = async (location: LocationType) => {
    // Don't do anything if selecting the same location
    if (currentLocation?._id === location._id) {
      setShowLocationModal(false);
      return;
    }

    setShowLocationModal(false);

    try {
      // Save the location - this updates api.locationId and context state
      await selectLocation(location);

      // Navigate to Dashboard tab - it will auto-refetch with the new location
      navigation.navigate('Dashboard' as never);
    } catch (error) {
      console.error('Error switching location:', error);
      Alert.alert('Error', 'Failed to switch location');
    }
  };

  const openLocationModal = () => {
    setShowLocationModal(true);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.firstName?.[0]?.toUpperCase() || 'U'}
            {user?.lastName?.[0]?.toUpperCase() || ''}
          </Text>
        </View>
        <Text style={styles.name}>
          {user?.firstName} {user?.lastName}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{getRoleLabel(user?.role || 'user')}</Text>
        </View>
        <TouchableOpacity style={styles.editProfileButton} onPress={openEditModal}>
          <Ionicons name="pencil" size={16} color="#2563eb" />
          <Text style={styles.editProfileText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Info Cards */}
      <View style={styles.section}>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="mail" size={24} color="#2563eb" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Email</Text>
              <Text style={styles.cardValue}>{user?.email}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="shield-checkmark" size={24} color="#10b981" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Role</Text>
              <Text style={styles.cardValue}>{getRoleLabel(user?.role || 'user')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Status</Text>
              <Text style={styles.cardValue}>Active</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Account Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>

        <TouchableOpacity style={styles.card} onPress={() => setShowPasswordModal(true)}>
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="key" size={24} color="#f59e0b" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardValue}>Change Password</Text>
              <Text style={styles.cardLabel}>Update your account password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Location Section */}
      {availableLocations.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>

          <TouchableOpacity style={styles.card} onPress={openLocationModal}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="business" size={24} color="#2563eb" />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardValue}>{currentLocation?.name || 'No location selected'}</Text>
                <Text style={styles.cardLabel}>
                  {currentLocation?.address || 'Tap to select a location'}
                </Text>
              </View>
              <View style={styles.locationBadge}>
                <Text style={styles.locationBadgeText}>{currentLocation?.code || '—'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" style={{ marginLeft: 8 }} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, {
              backgroundColor: pushNotificationsEnabled && pushStatus === 'enabled' ? '#dcfce7' :
                             pushStatus === 'unavailable' ? '#fee2e2' : '#fef3c7'
            }]}>
              <Ionicons
                name="notifications"
                size={24}
                color={pushNotificationsEnabled && pushStatus === 'enabled' ? '#10b981' :
                       pushStatus === 'unavailable' ? '#ef4444' : '#f59e0b'}
              />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardValue}>Push Notifications</Text>
              <Text style={styles.cardLabel}>
                {pushStatus === 'checking' ? 'Checking...' :
                 pushStatus === 'unavailable' ? 'Unavailable - requires native build' :
                 pushNotificationsEnabled ? 'Enabled - receiving notifications' :
                 'Disabled - you won\'t receive notifications'}
              </Text>
            </View>
            {pushStatus === 'enabled' && (
              <Switch
                value={pushNotificationsEnabled}
                onValueChange={handleTogglePushNotifications}
                disabled={togglingPush}
                trackColor={{ false: '#e2e8f0', true: '#86efac' }}
                thumbColor={pushNotificationsEnabled ? '#10b981' : '#94a3b8'}
              />
            )}
            {pushStatus === 'disabled' && (
              <TouchableOpacity onPress={checkPushNotificationStatus}>
                <Ionicons name="refresh" size={20} color="#f59e0b" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Information</Text>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardIcon}>
              <Ionicons name="information-circle" size={24} color="#64748b" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardLabel}>Version</Text>
              <Text style={styles.cardValue}>1.0.0</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Time Clock Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Time Clock</Text>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.cardIcon, { backgroundColor: isClockedIn ? '#dcfce7' : '#fef3c7' }]}>
              <Ionicons
                name="time"
                size={24}
                color={isClockedIn ? '#22c55e' : '#f59e0b'}
              />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardValue}>
                {isClockLoading ? 'Loading...' : isClockedIn ? 'Clocked In' : 'Not Clocked In'}
              </Text>
              <Text style={styles.cardLabel}>
                {isClockedIn && lastClockIn
                  ? `Since ${new Date(lastClockIn).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}`
                  : 'Tap to clock in/out'}
              </Text>
            </View>
            {isClockedIn ? (
              <View style={styles.clockedInBadge}>
                <Text style={styles.clockedInBadgeText}>Active</Text>
              </View>
            ) : null}
          </View>
        </View>

        {isClockedIn && !isOnBreak && (
          <View style={styles.clockActionButtons}>
            <TouchableOpacity
              style={styles.breakButton}
              onPress={() => handleStartBreak('breakfast')}
              disabled={isBreakLoading}
            >
              {isBreakLoading ? (
                <ActivityIndicator size="small" color="#d97706" />
              ) : (
                <>
                  <Ionicons name="sunny-outline" size={20} color="#d97706" />
                  <Text style={styles.breakButtonText}>Breakfast</Text>
                  <Text style={styles.breakDurationText}>({settings?.breakfastDurationMinutes || 15} min)</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.breakButton}
              onPress={() => handleStartBreak('lunch')}
              disabled={isBreakLoading}
            >
              {isBreakLoading ? (
                <ActivityIndicator size="small" color="#d97706" />
              ) : (
                <>
                  <Ionicons name="restaurant-outline" size={20} color="#d97706" />
                  <Text style={styles.breakButtonText}>Lunch</Text>
                  <Text style={styles.breakDurationText}>({settings?.lunchDurationMinutes || 30} min)</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
        {isClockedIn && !isOnBreak && (
          <View style={styles.clockOutRow}>
            <TouchableOpacity
              style={styles.clockOutButton}
              onPress={() => setShowClockOutModal(true)}
            >
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
              <Text style={styles.clockOutButtonText}>Clock Out</Text>
            </TouchableOpacity>
          </View>
        )}
        {isOnBreak && (
          <View style={[styles.breakStatusBanner, breakTimeExpired && styles.breakStatusBannerExpired]}>
            <View style={styles.breakStatusTop}>
              <Ionicons
                name={breakType === 'breakfast' ? 'sunny' : 'restaurant'}
                size={20}
                color={breakTimeExpired ? '#ef4444' : '#d97706'}
              />
              <Text style={[styles.breakStatusText, breakTimeExpired && styles.breakStatusTextExpired]}>
                {breakType === 'breakfast' ? 'Breakfast' : 'Lunch'} Break
              </Text>
              {isTimerPaused && (
                <View style={styles.pausedBadge}>
                  <Text style={styles.pausedBadgeText}>PAUSED</Text>
                </View>
              )}
            </View>
            <View style={styles.breakTimerContainer}>
              <Text style={[styles.breakTimerText, breakTimeExpired && styles.breakTimerTextExpired, isTimerPaused && styles.breakTimerTextPaused]}>
                {breakTimeRemaining !== null ? formatTimeRemaining(breakTimeRemaining) : '--:--'}
              </Text>
              {breakTimeExpired && (
                <Text style={styles.breakOverTimeText}>OVER TIME</Text>
              )}
            </View>
            {isAlarmPlaying && (
              <TouchableOpacity
                style={styles.stopAlarmButton}
                onPress={stopAlarm}
              >
                <Ionicons name="volume-mute" size={20} color="#fff" />
                <Text style={styles.stopAlarmButtonText}>Stop Alarm</Text>
              </TouchableOpacity>
            )}
            <View style={styles.breakButtonsRow}>
              <TouchableOpacity
                style={[styles.pauseButton, isTimerPaused && styles.pauseButtonActive]}
                onPress={toggleTimerPause}
              >
                <Ionicons
                  name={isTimerPaused ? 'play' : 'pause'}
                  size={20}
                  color={isTimerPaused ? '#fff' : '#64748b'}
                />
                <Text style={[styles.pauseButtonText, isTimerPaused && styles.pauseButtonTextActive]}>
                  {isTimerPaused ? 'Resume' : 'Pause'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.endBreakButton, breakTimeExpired && styles.endBreakButtonExpired]}
                onPress={handleEndBreak}
                disabled={isBreakLoading}
              >
                {isBreakLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="stop-circle" size={20} color="#fff" />
                    <Text style={styles.endBreakButtonText}>End Break</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Logout Button */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="#ef4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20 }}
            enableOnAndroid={true}
            extraScrollHeight={20}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>First Name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </KeyboardAwareScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEditModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSaveProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showPasswordModal} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TouchableOpacity onPress={() => setShowPasswordModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20 }}
            enableOnAndroid={true}
            extraScrollHeight={20}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Current Password</Text>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Current password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />
            </View>
          </KeyboardAwareScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPasswordModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleChangePassword}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Change Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Clock Out Modal */}
      <Modal
        visible={showClockOutModal}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <ClockInScreen
          mode="clock_out"
          onComplete={() => setShowClockOutModal(false)}
          onDismiss={() => setShowClockOutModal(false)}
        />
      </Modal>

      {/* Location Picker Modal */}
      <Modal visible={showLocationModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.locationModalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={[styles.modalHeader, { paddingTop: 20, paddingHorizontal: 20 }]}>
              <Text style={styles.modalTitle}>Switch Location</Text>
              <TouchableOpacity
                onPress={() => setShowLocationModal(false)}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={availableLocations}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.locationOption,
                    currentLocation?._id === item._id && styles.locationOptionActive
                  ]}
                  onPress={() => handleSwitchLocation(item)}
                >
                  <View style={[
                    styles.locationOptionIcon,
                    currentLocation?._id === item._id && styles.locationOptionIconActive
                  ]}>
                    <Text style={[
                      styles.locationOptionCode,
                      currentLocation?._id === item._id && styles.locationOptionCodeActive
                    ]}>{item.code}</Text>
                  </View>
                  <View style={styles.locationOptionContent}>
                    <Text style={[
                      styles.locationOptionName,
                      currentLocation?._id === item._id && styles.locationOptionNameActive
                    ]}>{item.name}</Text>
                    <Text style={styles.locationOptionAddress}>{item.address}</Text>
                  </View>
                  {currentLocation?._id === item._id && (
                    <Ionicons name="checkmark-circle" size={24} color="#2563eb" />
                  )}
                </TouchableOpacity>
              )}
              contentContainerStyle={{ padding: 16 }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    alignItems: 'center',
    paddingBottom: 24,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  email: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 4,
  },
  roleBadge: {
    marginTop: 12,
    backgroundColor: '#dbeafe',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 14,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 20,
  },
  editProfileText: {
    color: '#2563eb',
    fontWeight: '500',
    fontSize: 14,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  clockedInBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  clockedInBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
  clockOutButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  clockOutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef4444',
  },
  clockActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  breakButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  breakButtonActive: {
    backgroundColor: '#d97706',
    borderColor: '#d97706',
  },
  breakButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#d97706',
  },
  breakButtonTextActive: {
    color: '#fff',
  },
  breakDurationText: {
    fontSize: 12,
    color: '#92400e',
    marginLeft: 4,
  },
  clockOutRow: {
    marginTop: 12,
  },
  breakStatusBanner: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  breakStatusBannerExpired: {
    backgroundColor: '#fee2e2',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  breakStatusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  breakStatusText: {
    fontSize: 16,
    color: '#92400e',
    fontWeight: '600',
  },
  breakStatusTextExpired: {
    color: '#b91c1c',
  },
  breakTimerContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  breakTimerText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#d97706',
    fontVariant: ['tabular-nums'],
  },
  breakTimerTextExpired: {
    color: '#ef4444',
  },
  breakTimerTextPaused: {
    color: '#94a3b8',
  },
  pausedBadge: {
    backgroundColor: '#94a3b8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  pausedBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  breakButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    width: '100%',
  },
  pauseButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pauseButtonActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  pauseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  pauseButtonTextActive: {
    color: '#fff',
  },
  breakOverTimeText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ef4444',
    marginTop: 4,
  },
  stopAlarmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginVertical: 12,
    width: '100%',
  },
  stopAlarmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  endBreakButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#d97706',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  endBreakButtonExpired: {
    backgroundColor: '#ef4444',
  },
  endBreakButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalBody: {
    padding: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    padding: 14,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Location styles
  locationBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  locationBadgeText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 12,
  },
  locationModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  locationOptionActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  locationOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  locationOptionIconActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  locationOptionCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748b',
  },
  locationOptionCodeActive: {
    color: '#2563eb',
  },
  locationOptionContent: {
    flex: 1,
  },
  locationOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  locationOptionNameActive: {
    color: '#2563eb',
  },
  locationOptionAddress: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
});
