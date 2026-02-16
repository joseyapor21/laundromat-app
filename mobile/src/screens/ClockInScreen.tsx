import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTimeClock } from '../contexts/TimeClockContext';

interface ClockInScreenProps {
  mode?: 'clock_in' | 'clock_out';
  onComplete?: () => void;
  onDismiss?: () => void;
}

export default function ClockInScreen({ mode = 'clock_in', onComplete, onDismiss }: ClockInScreenProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { clockIn, clockOut, dismissClockInPrompt } = useTimeClock();

  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');

      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            mayShowUserSettingsDialog: false,
          });
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy || undefined,
          });

          // Reverse geocode to get address
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
              setAddress(parts.join(', ') || addr.name || null);
            }
          } catch (geoError) {
            console.error('Error reverse geocoding:', geoError);
          }
        } catch (error) {
          console.error('Error getting location:', error);
        }
      } else if (!canAskAgain) {
        // Permission was denied and can't ask again - need to go to Settings
        Alert.alert(
          'Location Permission Required',
          'Please enable location permission in your device Settings to use this feature.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (error) {
      console.error('Error requesting location permission:', error);
    }
  };

  const handleDismiss = () => {
    if (mode === 'clock_in') {
      dismissClockInPrompt();
    }
    if (onDismiss) {
      onDismiss();
    } else {
      navigation.goBack();
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);

      // Get fresh location (use last known if available for speed)
      if (locationPermission) {
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown && Date.now() - lastKnown.timestamp < 60000) {
            // Use last known if less than 1 minute old
            setLocation({
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              accuracy: lastKnown.coords.accuracy || undefined,
            });
          } else {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 3000,
              mayShowUserSettingsDialog: false,
            });
            setLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: loc.coords.accuracy || undefined,
            });
          }
        } catch (error) {
          console.error('Error getting location:', error);
        }
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        exif: false,
        skipProcessing: true,
      });

      if (photo?.base64) {
        // Use the photo directly without extra manipulation for speed
        setCapturedPhoto(photo.base64);
      } else if (photo?.uri) {
        // Fallback: compress the image
        const manipulated = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: 640 } }],
          { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        setCapturedPhoto(manipulated.base64 || null);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
  };

  const submitClockEntry = async () => {
    // Photo required for clock in, optional for clock out
    if (mode === 'clock_in' && !capturedPhoto) {
      Alert.alert('Error', 'Please take a photo first');
      return;
    }

    if (!location) {
      Alert.alert('Error', 'Location is required. Please enable location services.');
      return;
    }

    try {
      setIsSubmitting(true);

      const data: { photo?: string; location: { latitude: number; longitude: number; accuracy?: number; address?: string } } = {
        location: {
          ...location,
          address: address || undefined,
        },
      };

      if (capturedPhoto) {
        data.photo = `data:image/jpeg;base64,${capturedPhoto}`;
      }

      if (mode === 'clock_in') {
        await clockIn(data);
        Alert.alert('Success', 'You have been clocked in!', [
          {
            text: 'OK',
            onPress: () => {
              if (onComplete) {
                onComplete();
              } else {
                navigation.goBack();
              }
            },
          },
        ]);
      } else {
        await clockOut(data);
        Alert.alert('Success', 'You have been clocked out!', [
          {
            text: 'OK',
            onPress: () => {
              if (onComplete) {
                onComplete();
              } else {
                navigation.goBack();
              }
            },
          },
        ]);
      }
    } catch (error) {
      console.error('Error submitting clock entry:', error);
      Alert.alert('Error', 'Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Permission handling
  if (permission === null || locationPermission === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Requesting permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#94a3b8" />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to take your {mode === 'clock_in' ? 'clock-in' : 'clock-out'} photo.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!locationPermission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.permissionContainer}>
          <Ionicons name="location-outline" size={64} color="#94a3b8" />
          <Text style={styles.permissionTitle}>Location Permission Required</Text>
          <Text style={styles.permissionText}>
            We need location access to record where you {mode === 'clock_in' ? 'clock in' : 'clock out'}.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestLocationPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Captured photo preview
  if (capturedPhoto) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={retakePhoto} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {mode === 'clock_in' ? 'Clock In' : 'Clock Out'}
          </Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.previewContainer}>
          <View style={styles.photoPreview}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${capturedPhoto}` }}
              style={[styles.previewImage, { transform: [{ scaleX: -1 }] }]}
              resizeMode="cover"
            />
          </View>

          <View style={styles.locationInfo}>
            <Ionicons name="location" size={20} color="#22c55e" />
            <Text style={styles.locationText}>
              {address || (location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Getting location...')}
            </Text>
          </View>

          <View style={styles.timestampInfo}>
            <Ionicons name="time" size={20} color="#3b82f6" />
            <Text style={styles.timestampText}>
              {new Date().toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </Text>
          </View>
        </View>

        <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={styles.retakeButton} onPress={retakePhoto}>
            <Ionicons name="camera-reverse" size={24} color="#64748b" />
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={submitClockEntry}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.submitButtonText}>
                  {mode === 'clock_in' ? 'Clock In' : 'Clock Out'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Clock out view - no photo required
  if (mode === 'clock_out') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDismiss} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Clock Out</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.clockOutContainer}>
          <View style={styles.clockOutIcon}>
            <Ionicons name="log-out" size={64} color="#ef4444" />
          </View>
          <Text style={styles.clockOutTitle}>Ready to Clock Out?</Text>

          <View style={styles.locationInfo}>
            <Ionicons name="location" size={20} color="#22c55e" />
            <Text style={styles.locationText}>
              {address || (location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Getting location...')}
            </Text>
          </View>

          <View style={styles.timestampInfo}>
            <Ionicons name="time" size={20} color="#3b82f6" />
            <Text style={styles.timestampText}>
              {new Date().toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </Text>
          </View>
        </View>

        <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={styles.dismissTextButton} onPress={handleDismiss}>
            <Text style={styles.dismissTextButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.clockOutButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={submitClockEntry}
            disabled={isSubmitting || !location}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="log-out" size={24} color="#fff" />
                <Text style={styles.submitButtonText}>Clock Out</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera view for clock in
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleDismiss} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clock In</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
        >
          <View style={styles.cameraOverlay}>
            <View style={styles.faceGuide}>
              <View style={[styles.cornerTL, styles.corner]} />
              <View style={[styles.cornerTR, styles.corner]} />
              <View style={[styles.cornerBL, styles.corner]} />
              <View style={[styles.cornerBR, styles.corner]} />
            </View>
            <Text style={styles.cameraInstruction}>Position your face in the frame</Text>
          </View>
        </CameraView>
      </View>

      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={styles.dismissTextButton} onPress={handleDismiss}>
          <Text style={styles.dismissTextButtonText}>Dismiss</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
          onPress={takePhoto}
          disabled={isCapturing}
        >
          {isCapturing ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>

        <View style={styles.placeholderButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#1e293b',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  dismissButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  dismissButtonText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceGuide: {
    width: 250,
    height: 300,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#fff',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 20,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 20,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 20,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 20,
  },
  cameraInstruction: {
    marginTop: 20,
    fontSize: 16,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dismissTextButton: {
    width: 80,
    alignItems: 'center',
  },
  dismissTextButtonText: {
    fontSize: 16,
    color: '#94a3b8',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  placeholderButton: {
    width: 80,
  },
  previewContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreview: {
    width: 250,
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    marginBottom: 24,
  },
  previewImage: {
    flex: 1,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  locationText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  timestampInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timestampText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  retakeButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#22c55e',
    borderRadius: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Clock out styles
  clockOutContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  clockOutIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  clockOutTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 32,
  },
  clockOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: '#ef4444',
    borderRadius: 12,
  },
});
