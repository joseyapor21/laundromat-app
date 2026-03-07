import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface DriverTrackingContextType {
  isTracking: boolean;
  lastLocation: { latitude: number; longitude: number } | null;
  error: string | null;
}

const DriverTrackingContext = createContext<DriverTrackingContextType>({
  isTracking: false,
  lastLocation: null,
  error: null,
});

export function useDriverTracking() {
  return useContext(DriverTrackingContext);
}

interface Props {
  children: React.ReactNode;
}

export function DriverTrackingProvider({ children }: Props) {
  const { user, isAuthenticated } = useAuth();
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Check if user should be tracked (is a driver or has driver role)
  const shouldTrack = isAuthenticated && user?.isDriver;

  const startTracking = async () => {
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
          setError('Location permission denied');
          return;
        }
      }
      setError(null);
      setIsTracking(true);

      // Start watching position
      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000, // Update every 10 seconds
          distanceInterval: 20, // Or when moved 20+ meters
        },
        async (loc) => {
          const newLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setLastLocation(newLocation);

          // Upload to server
          try {
            await api.updateDriverLocation({
              latitude: newLocation.latitude,
              longitude: newLocation.longitude,
              heading: loc.coords.heading,
              speed: loc.coords.speed,
              accuracy: loc.coords.accuracy,
            });
          } catch (uploadErr) {
            console.error('Failed to upload driver location:', uploadErr);
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start location tracking');
      setIsTracking(false);
    }
  };

  const stopTracking = async () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    setIsTracking(false);
    setLastLocation(null);

    // Clear location from server
    try {
      await api.clearDriverLocation();
    } catch (err) {
      console.error('Failed to clear driver location:', err);
    }
  };

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;

      if (nextAppState === 'active' && shouldTrack) {
        startTracking();
      } else if (nextAppState !== 'active' && isTracking) {
        // Pause tracking when app goes to background
        if (subscriptionRef.current) {
          subscriptionRef.current.remove();
          subscriptionRef.current = null;
        }
        setIsTracking(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [shouldTrack, isTracking]);

  // Start/stop tracking based on authentication and driver status
  useEffect(() => {
    if (shouldTrack && appStateRef.current === 'active') {
      startTracking();
    } else if (!shouldTrack && isTracking) {
      stopTracking();
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [shouldTrack]);

  return (
    <DriverTrackingContext.Provider value={{ isTracking, lastLocation, error }}>
      {children}
    </DriverTrackingContext.Provider>
  );
}
