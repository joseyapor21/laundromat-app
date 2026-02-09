import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { useTimeClock } from '../contexts/TimeClockContext';
import { useLocation } from '../contexts/LocationContext';
import { api } from '../services/api';
import ClockInScreen from './ClockInScreen';
import type { Location as LocationType } from '../types';

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
  const { isClockedIn, isOnBreak, lastClockIn, lastBreakStart, startBreak, endBreak, isLoading: isClockLoading } = useTimeClock();
  const { currentLocation, availableLocations, selectLocation, refreshLocations } = useLocation();

  // Clock out modal
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [isBreakLoading, setIsBreakLoading] = useState(false);

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
    // Load locations if not already loaded
    if (availableLocations.length === 0) {
      refreshLocations();
    }
  }, []);

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

  const handleBreakToggle = async () => {
    setIsBreakLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission is required for break tracking');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
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

      if (isOnBreak) {
        await endBreak({ location });
        Alert.alert('Break Ended', 'Your break has been recorded.');
      } else {
        await startBreak({ location });
        Alert.alert('Break Started', 'Your break has been recorded.');
      }
    } catch (error: any) {
      console.error('Break error:', error);
      Alert.alert('Error', error.message || 'Failed to record break');
    } finally {
      setIsBreakLoading(false);
    }
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

        {isClockedIn && (
          <View style={styles.clockActionButtons}>
            <TouchableOpacity
              style={[styles.breakButton, isOnBreak && styles.breakButtonActive]}
              onPress={handleBreakToggle}
              disabled={isBreakLoading}
            >
              {isBreakLoading ? (
                <ActivityIndicator size="small" color={isOnBreak ? '#fff' : '#d97706'} />
              ) : (
                <>
                  <Ionicons
                    name={isOnBreak ? 'cafe' : 'cafe-outline'}
                    size={20}
                    color={isOnBreak ? '#fff' : '#d97706'}
                  />
                  <Text style={[styles.breakButtonText, isOnBreak && styles.breakButtonTextActive]}>
                    {isOnBreak ? 'End Break' : 'Start Break'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
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
          <View style={styles.breakStatusBanner}>
            <Ionicons name="cafe" size={16} color="#d97706" />
            <Text style={styles.breakStatusText}>
              On break since {lastBreakStart?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </Text>
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
  breakStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  breakStatusText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '500',
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
