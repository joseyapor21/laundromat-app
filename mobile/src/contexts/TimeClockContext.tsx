import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import type { ClockStatus, TimeEntry } from '../types';

const CLOCK_STATUS_CACHE_KEY = 'cached_clock_status';

export type BreakType = 'breakfast' | 'lunch' | null;

interface TimeClockContextType {
  isClockedIn: boolean;
  isOnBreak: boolean;
  breakType: BreakType;
  isLoading: boolean;
  lastClockIn: Date | null;
  lastClockOut: Date | null;
  lastBreakStart: Date | null;
  lastBreakEnd: Date | null;
  todayEntries: ClockStatus['todayEntries'];
  showClockInPrompt: boolean;
  dismissedClockInPrompt: boolean;
  checkClockStatus: () => Promise<void>;
  clockIn: (data: {
    photo: string;
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
  }) => Promise<TimeEntry>;
  clockOut: (data: {
    photo?: string;
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
  }) => Promise<TimeEntry>;
  startBreak: (data: {
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
    breakType?: 'breakfast' | 'lunch';
  }) => Promise<TimeEntry>;
  endBreak: (data: {
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
  }) => Promise<TimeEntry>;
  dismissClockInPrompt: () => void;
  resetDismissed: () => void;
}

const TimeClockContext = createContext<TimeClockContextType | undefined>(undefined);

export function TimeClockProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakType, setBreakType] = useState<BreakType>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastClockIn, setLastClockIn] = useState<Date | null>(null);
  const [lastClockOut, setLastClockOut] = useState<Date | null>(null);
  const [lastBreakStart, setLastBreakStart] = useState<Date | null>(null);
  const [lastBreakEnd, setLastBreakEnd] = useState<Date | null>(null);
  const [todayEntries, setTodayEntries] = useState<ClockStatus['todayEntries']>([]);
  const [dismissedClockInPrompt, setDismissedClockInPrompt] = useState(false);

  // Track app state to refresh when coming back to foreground
  const appState = useRef(AppState.currentState);

  // Cache clock status locally
  const cacheClockStatus = async (status: ClockStatus) => {
    try {
      await SecureStore.setItemAsync(CLOCK_STATUS_CACHE_KEY, JSON.stringify(status));
      console.log('Clock status cached:', status.isClockedIn ? 'clocked in' : 'not clocked in');
    } catch (e) {
      console.log('Failed to cache clock status:', e);
    }
  };

  const getCachedClockStatus = async (): Promise<ClockStatus | null> => {
    try {
      const cached = await SecureStore.getItemAsync(CLOCK_STATUS_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      console.log('Failed to get cached clock status:', e);
      return null;
    }
  };

  const clearCachedClockStatus = async () => {
    try {
      await SecureStore.deleteItemAsync(CLOCK_STATUS_CACHE_KEY);
    } catch (e) {
      console.log('Failed to clear cached clock status:', e);
    }
  };

  const applyClockStatus = (status: ClockStatus) => {
    setIsClockedIn(status.isClockedIn);
    setIsOnBreak(status.isOnBreak || false);
    setLastClockIn(status.lastClockIn ? new Date(status.lastClockIn) : null);
    setLastClockOut(status.lastClockOut ? new Date(status.lastClockOut) : null);
    setLastBreakStart(status.lastBreakStart ? new Date(status.lastBreakStart) : null);
    setLastBreakEnd(status.lastBreakEnd ? new Date(status.lastBreakEnd) : null);
    setTodayEntries(status.todayEntries || []);
  };

  const checkClockStatus = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setIsLoading(true);
      const status = await api.getClockStatus();
      applyClockStatus(status);
      // Cache the status for offline access
      await cacheClockStatus(status);
    } catch (error) {
      console.error('Failed to check clock status:', error);
      // Try to use cached status if network fails
      const cachedStatus = await getCachedClockStatus();
      if (cachedStatus) {
        console.log('Using cached clock status');
        applyClockStatus(cachedStatus);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const clockIn = useCallback(async (data: {
    photo: string;
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
  }): Promise<TimeEntry> => {
    const entry = await api.clockIn({
      ...data,
      deviceInfo: `${user?.firstName || 'User'}'s device`,
    });

    // Update state
    setIsClockedIn(true);
    setLastClockIn(new Date(entry.timestamp));
    const newEntry = { _id: entry._id, type: entry.type, timestamp: entry.timestamp, location: entry.location };
    setTodayEntries(prev => {
      const newEntries = [newEntry, ...prev];
      // Update cache with new clock status
      cacheClockStatus({
        isClockedIn: true,
        isOnBreak: false,
        lastClockIn: entry.timestamp,
        todayEntries: newEntries,
      });
      return newEntries;
    });
    setDismissedClockInPrompt(false);

    return entry;
  }, [user]);

  const clockOut = useCallback(async (data: {
    photo?: string;
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
  }): Promise<TimeEntry> => {
    const entry = await api.clockOut({
      ...data,
      deviceInfo: `${user?.firstName || 'User'}'s device`,
    });

    // Update state
    setIsClockedIn(false);
    setLastClockOut(new Date(entry.timestamp));
    const newEntry = { _id: entry._id, type: entry.type, timestamp: entry.timestamp, location: entry.location };
    setTodayEntries(prev => {
      const newEntries = [newEntry, ...prev];
      // Update cache with new clock status
      cacheClockStatus({
        isClockedIn: false,
        isOnBreak: false,
        lastClockOut: entry.timestamp,
        todayEntries: newEntries,
      });
      return newEntries;
    });

    return entry;
  }, [user]);

  const startBreak = useCallback(async (data: {
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
    breakType?: 'breakfast' | 'lunch';
  }): Promise<TimeEntry> => {
    const entry = await api.startBreak({
      ...data,
      deviceInfo: `${user?.firstName || 'User'}'s device`,
    });

    // Update state
    setIsOnBreak(true);
    setBreakType(data.breakType || null);
    setLastBreakStart(new Date(entry.timestamp));
    const newEntry = { _id: entry._id, type: entry.type, timestamp: entry.timestamp, location: entry.location };
    setTodayEntries(prev => {
      const newEntries = [newEntry, ...prev];
      // Update cache with new clock status
      cacheClockStatus({
        isClockedIn: true,
        isOnBreak: true,
        lastBreakStart: entry.timestamp,
        todayEntries: newEntries,
      });
      return newEntries;
    });

    return entry;
  }, [user]);

  const endBreak = useCallback(async (data: {
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
  }): Promise<TimeEntry> => {
    const entry = await api.endBreak({
      ...data,
      deviceInfo: `${user?.firstName || 'User'}'s device`,
    });

    // Update state
    setIsOnBreak(false);
    setBreakType(null);
    setLastBreakEnd(new Date(entry.timestamp));
    const newEntry = { _id: entry._id, type: entry.type, timestamp: entry.timestamp, location: entry.location };
    setTodayEntries(prev => {
      const newEntries = [newEntry, ...prev];
      // Update cache with new clock status
      cacheClockStatus({
        isClockedIn: true,
        isOnBreak: false,
        lastBreakEnd: entry.timestamp,
        todayEntries: newEntries,
      });
      return newEntries;
    });

    return entry;
  }, [user]);

  const dismissClockInPrompt = useCallback(() => {
    setDismissedClockInPrompt(true);
  }, []);

  const resetDismissed = useCallback(() => {
    setDismissedClockInPrompt(false);
  }, []);

  // Load cached clock status immediately on mount, then refresh from API
  useEffect(() => {
    const loadCachedAndRefresh = async () => {
      if (isAuthenticated) {
        // First, load cached status immediately to prevent clock-in prompt flash
        const cachedStatus = await getCachedClockStatus();
        if (cachedStatus) {
          console.log('Loaded cached clock status:', cachedStatus.isClockedIn ? 'clocked in' : 'not clocked in');
          applyClockStatus(cachedStatus);
          setIsLoading(false);
        }
        // Then refresh from server in background
        checkClockStatus();
      } else {
        // Reset state when logged out
        setIsClockedIn(false);
        setIsOnBreak(false);
        setLastClockIn(null);
        setLastClockOut(null);
        setLastBreakStart(null);
        setLastBreakEnd(null);
        setTodayEntries([]);
        setDismissedClockInPrompt(false);
        setIsLoading(false);
        clearCachedClockStatus();
      }
    };
    loadCachedAndRefresh();
  }, [isAuthenticated]);

  // Refresh clock status when app comes back to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      // App came back to foreground
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App came to foreground, refreshing clock status...');
        if (isAuthenticated) {
          checkClockStatus();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, checkClockStatus]);

  // Show clock-in prompt if authenticated, not clocked in, not loading, and not dismissed
  const showClockInPrompt = isAuthenticated && !isClockedIn && !isLoading && !dismissedClockInPrompt;

  return (
    <TimeClockContext.Provider
      value={{
        isClockedIn,
        isOnBreak,
        breakType,
        isLoading,
        lastClockIn,
        lastClockOut,
        lastBreakStart,
        lastBreakEnd,
        todayEntries,
        showClockInPrompt,
        dismissedClockInPrompt,
        checkClockStatus,
        clockIn,
        clockOut,
        startBreak,
        endBreak,
        dismissClockInPrompt,
        resetDismissed,
      }}
    >
      {children}
    </TimeClockContext.Provider>
  );
}

export function useTimeClock() {
  const context = useContext(TimeClockContext);
  if (context === undefined) {
    throw new Error('useTimeClock must be used within a TimeClockProvider');
  }
  return context;
}
