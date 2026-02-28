import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

const API_BASE_URL = 'https://cloud.homation.us';

interface UpdateRequiredScreenProps {
  currentVersion: string;
  latestVersion: string;
  updateMessage: string;
  updateUrl: string;
  onRetry: () => void;
  onBypass?: () => void;
}

export default function UpdateRequiredScreen({
  currentVersion,
  latestVersion,
  updateMessage,
  updateUrl,
  onRetry,
  onBypass,
}: UpdateRequiredScreenProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const handleVersionTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);
    if (newCount >= 5) {
      setTapCount(0);
      setShowAdminLogin(true);
    }
  };

  const handleAdminLogin = async () => {
    if (!adminEmail || !adminPassword) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoggingIn(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });

      const data = await response.json();

      if (response.ok && data.user?.role === 'admin') {
        setShowAdminLogin(false);
        setAdminEmail('');
        setAdminPassword('');
        onBypass?.();
      } else if (response.ok && data.user?.role !== 'admin') {
        Alert.alert('Access Denied', 'Only administrators can bypass the update.');
      } else {
        Alert.alert('Error', data.error || 'Invalid credentials');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to verify credentials');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleUpdate = async () => {
    if (Platform.OS === 'ios') {
      // For iOS, open the itms-services URL in Safari
      try {
        await Linking.openURL(updateUrl);
      } catch (error) {
        Alert.alert('Error', 'Failed to open update link. Please try again.');
      }
    } else if (Platform.OS === 'android') {
      // For Android, download APK and install
      setDownloading(true);
      setDownloadProgress(0);

      try {
        const fileName = 'Laundromat-update.apk';
        const fileUri = FileSystem.documentDirectory + fileName;

        // Download the APK
        const downloadResumable = FileSystem.createDownloadResumable(
          updateUrl,
          fileUri,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
          }
        );

        const result = await downloadResumable.downloadAsync();

        if (result?.uri) {
          // Get content URI for installation
          const contentUri = await FileSystem.getContentUriAsync(result.uri);

          // Launch install intent
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: 'application/vnd.android.package-archive',
          });
        }
      } catch (error) {
        console.error('Download error:', error);
        Alert.alert(
          'Download Failed',
          'Failed to download the update. Please try again or download manually.',
          [
            { text: 'Try Again', onPress: handleUpdate },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } finally {
        setDownloading(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="cloud-download" size={80} color="#2563eb" />
        </View>

        <Text style={styles.title}>Update Required</Text>

        <Text style={styles.message}>{updateMessage}</Text>

        <TouchableOpacity style={styles.versionContainer} onPress={handleVersionTap} activeOpacity={0.8}>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Current Version:</Text>
            <Text style={styles.versionValue}>{currentVersion}</Text>
          </View>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Latest Version:</Text>
            <Text style={[styles.versionValue, styles.latestVersion]}>{latestVersion}</Text>
          </View>
        </TouchableOpacity>

        {downloading ? (
          <View style={styles.downloadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.downloadingText}>
              Downloading... {downloadProgress}%
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${downloadProgress}%` }]} />
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
            <Ionicons name="download" size={24} color="#fff" />
            <Text style={styles.updateButtonText}>
              {Platform.OS === 'ios' ? 'Install Update' : 'Download & Install'}
            </Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'ios' && (
          <Text style={styles.iosNote}>
            Tap "Install Update" to open Safari and install the new version.
            You may need to trust the developer in Settings → General → VPN & Device Management.
          </Text>
        )}

        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Ionicons name="refresh" size={20} color="#64748b" />
          <Text style={styles.retryButtonText}>Check Again</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.adminBypassButton} onPress={() => setShowAdminLogin(true)}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#94a3b8" />
          <Text style={styles.adminBypassText}>Admin Bypass</Text>
        </TouchableOpacity>
      </View>

      {/* Admin Login Modal */}
      <Modal visible={showAdminLogin} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Admin Bypass</Text>
            <Text style={styles.modalSubtitle}>Enter admin credentials to continue</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Admin Email"
              placeholderTextColor="#94a3b8"
              value={adminEmail}
              onChangeText={setAdminEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              value={adminPassword}
              onChangeText={setAdminPassword}
              secureTextEntry
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowAdminLogin(false);
                  setAdminEmail('');
                  setAdminPassword('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalLoginButton}
                onPress={handleAdminLogin}
                disabled={loggingIn}
              >
                {loggingIn ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalLoginText}>Login</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  versionContainer: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  versionLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  versionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  latestVersion: {
    color: '#16a34a',
  },
  downloadingContainer: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  downloadingText: {
    fontSize: 16,
    color: '#2563eb',
    marginTop: 12,
    fontWeight: '600',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    gap: 10,
    marginBottom: 16,
  },
  updateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  iosNote: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    color: '#64748b',
  },
  adminBypassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 8,
    gap: 6,
  },
  adminBypassText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  modalLoginButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  modalLoginText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
