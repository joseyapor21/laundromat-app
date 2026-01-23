import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import type { ClockStatus, TimeEntry } from '../types';

interface TimeClockContextType {
  isClockedIn: boolean;
  isLoading: boolean;
  lastClockIn: Date | null;
  lastClockOut: Date | null;
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
    photo: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [lastClockIn, setLastClockIn] = useState<Date | null>(null);
  const [lastClockOut, setLastClockOut] = useState<Date | null>(null);
  const [todayEntries, setTodayEntries] = useState<ClockStatus['todayEntries']>([]);
  const [dismissedClockInPrompt, setDismissedClockInPrompt] = useState(false);

  // Check clock status when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      checkClockStatus();
    } else {
      // Reset state when logged out
      setIsClockedIn(false);
      setLastClockIn(null);
      setLastClockOut(null);
      setTodayEntries([]);
      setDismissedClockInPrompt(false);
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const checkClockStatus = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setIsLoading(true);
      const status = await api.getClockStatus();
      setIsClockedIn(status.isClockedIn);
      setLastClockIn(status.lastClockIn ? new Date(status.lastClockIn) : null);
      setLastClockOut(status.lastClockOut ? new Date(status.lastClockOut) : null);
      setTodayEntries(status.todayEntries || []);
    } catch (error) {
      console.error('Failed to check clock status:', error);
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
    setTodayEntries(prev => [
      { _id: entry._id, type: entry.type, timestamp: entry.timestamp, location: entry.location },
      ...prev,
    ]);
    setDismissedClockInPrompt(false);

    return entry;
  }, [user]);

  const clockOut = useCallback(async (data: {
    photo: string;
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
    setTodayEntries(prev => [
      { _id: entry._id, type: entry.type, timestamp: entry.timestamp, location: entry.location },
      ...prev,
    ]);

    return entry;
  }, [user]);

  const dismissClockInPrompt = useCallback(() => {
    setDismissedClockInPrompt(true);
  }, []);

  const resetDismissed = useCallback(() => {
    setDismissedClockInPrompt(false);
  }, []);

  // Show clock-in prompt if authenticated, not clocked in, not loading, and not dismissed
  const showClockInPrompt = isAuthenticated && !isClockedIn && !isLoading && !dismissedClockInPrompt;

  return (
    <TimeClockContext.Provider
      value={{
        isClockedIn,
        isLoading,
        lastClockIn,
        lastClockOut,
        todayEntries,
        showClockInPrompt,
        dismissedClockInPrompt,
        checkClockStatus,
        clockIn,
        clockOut,
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
