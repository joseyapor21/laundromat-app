import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

const AUTO_REFRESH_INTERVAL = 10000; // 10 seconds

/**
 * Hook that automatically calls a refresh function at regular intervals
 * Only refreshes when the screen is focused and the app is in the foreground
 */
export function useAutoRefresh(
  refreshFn: () => Promise<void> | void,
  interval: number = AUTO_REFRESH_INTERVAL
) {
  const isFocused = useIsFocused();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const startPolling = useCallback(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Start new interval
    intervalRef.current = setInterval(() => {
      // Only refresh if app is active and screen is focused
      if (appStateRef.current === 'active') {
        refreshFn();
      }
    }, interval);
  }, [refreshFn, interval]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Handle app state changes (background/foreground)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;

      if (nextAppState === 'active' && isFocused) {
        // App came to foreground, refresh immediately and restart polling
        refreshFn();
        startPolling();
      } else if (nextAppState !== 'active') {
        // App went to background, stop polling
        stopPolling();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isFocused, refreshFn, startPolling, stopPolling]);

  useEffect(() => {
    if (isFocused && appStateRef.current === 'active') {
      // Screen is focused, start polling
      startPolling();
    } else {
      // Screen is not focused, stop polling
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [isFocused, startPolling, stopPolling]);

  return { stopPolling, startPolling };
}
