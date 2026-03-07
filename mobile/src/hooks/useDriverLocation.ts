import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import * as Location from 'expo-location';
import { api } from '../services/api';

export interface DriverLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

interface UseDriverLocationOptions {
  enabled?: boolean;
  timeInterval?: number;
  distanceInterval?: number;
  uploadToServer?: boolean; // Whether to upload location to server (for drivers)
}

/**
 * Hook that tracks the driver's live GPS location
 * Only tracks when the screen is focused and the app is in the foreground
 */
export function useDriverLocation(options: UseDriverLocationOptions = {}) {
  const {
    enabled = true,
    timeInterval = 5000, // Update every 5 seconds
    distanceInterval = 10, // Update if moved 10+ meters
    uploadToServer = false, // Only upload if explicitly enabled
  } = options;

  const isFocused = useIsFocused();
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const startTracking = useCallback(async () => {
    // Stop any existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    try {
      // Check permission
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus !== 'granted') {
          setHasPermission(false);
          setError('Location permission denied');
          return;
        }
      }
      setHasPermission(true);
      setError(null);

      // Start watching position
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval,
          distanceInterval,
        },
        async (loc) => {
          const newLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
            heading: loc.coords.heading,
            speed: loc.coords.speed,
            timestamp: loc.timestamp,
          };
          setLocation(newLocation);

          // Upload to server if enabled
          if (uploadToServer) {
            try {
              await api.updateDriverLocation({
                latitude: newLocation.latitude,
                longitude: newLocation.longitude,
                heading: newLocation.heading,
                speed: newLocation.speed,
                accuracy: newLocation.accuracy,
              });
            } catch (uploadErr) {
              console.error('Failed to upload location:', uploadErr);
            }
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start location tracking');
    }
  }, [timeInterval, distanceInterval, uploadToServer]);

  const stopTracking = useCallback(async () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    // Clear location from server when stopping
    if (uploadToServer) {
      try {
        await api.clearDriverLocation();
      } catch (err) {
        console.error('Failed to clear driver location:', err);
      }
    }
  }, [uploadToServer]);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;

      if (nextAppState === 'active' && isFocused && enabled) {
        startTracking();
      } else if (nextAppState !== 'active') {
        stopTracking();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isFocused, enabled, startTracking, stopTracking]);

  // Handle focus changes
  useEffect(() => {
    if (isFocused && appStateRef.current === 'active' && enabled) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [isFocused, enabled, startTracking, stopTracking]);

  return {
    location,
    error,
    hasPermission,
    startTracking,
    stopTracking,
  };
}
