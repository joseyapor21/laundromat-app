import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';
import type { User, Location } from '../types';

const USER_CACHE_KEY = 'cached_user';

// Dynamically import push notifications to avoid crash in Expo Go
let pushNotificationService: {
  setupAndroidChannel: () => Promise<void>;
  registerForPushNotifications: () => Promise<string | null>;
  unregisterPushNotifications: () => Promise<void>;
} | null = null;

try {
  pushNotificationService = require('../services/pushNotifications').pushNotificationService;
} catch (e) {
  console.log('Push notifications not available (Expo Go)');
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<Location[]>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initAuth();
  }, []);

  // Cache user data locally for offline access
  async function cacheUser(userData: User) {
    try {
      await SecureStore.setItemAsync(USER_CACHE_KEY, JSON.stringify(userData));
    } catch (e) {
      console.log('Failed to cache user:', e);
    }
  }

  async function getCachedUser(): Promise<User | null> {
    try {
      const cached = await SecureStore.getItemAsync(USER_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      console.log('Failed to get cached user:', e);
      return null;
    }
  }

  async function clearCachedUser() {
    try {
      await SecureStore.deleteItemAsync(USER_CACHE_KEY);
    } catch (e) {
      console.log('Failed to clear cached user:', e);
    }
  }

  async function initAuth() {
    try {
      await api.init();
      if (api.getToken()) {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
        // Cache the user for offline access
        await cacheUser(currentUser);
        // Register for push notifications if already logged in
        if (pushNotificationService) {
          try {
            await pushNotificationService.setupAndroidChannel();
            await pushNotificationService.registerForPushNotifications();
          } catch (e) {
            console.log('Push notifications not available');
          }
        }
      }
    } catch (error: any) {
      console.log('Auth init error:', error);
      // Only clear token if it's an authentication error (401)
      const isAuthError = error?.status === 401 ||
        error?.message?.includes('401') ||
        error?.message?.includes('Unauthorized') ||
        error?.message?.includes('Not authenticated');

      if (isAuthError) {
        console.log('Auth token invalid, clearing...');
        await api.clearToken();
        await clearCachedUser();
      } else if (api.getToken()) {
        // Network error but we have a token - use cached user data
        console.log('Network/other error, using cached user data');
        const cachedUser = await getCachedUser();
        if (cachedUser) {
          setUser(cachedUser);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<Location[]> {
    const { user: loggedInUser, locations } = await api.login(email, password);
    setUser(loggedInUser);
    // Cache user for offline access
    await cacheUser(loggedInUser);

    // If only one location, auto-select it
    if (locations.length === 1) {
      await api.setLocationId(locations[0]._id);
    }

    // Register for push notifications after login
    if (pushNotificationService) {
      try {
        await pushNotificationService.setupAndroidChannel();
        await pushNotificationService.registerForPushNotifications();
      } catch (e) {
        console.log('Push notifications not available');
      }
    }

    return locations;
  }

  async function logout() {
    try {
      // Unregister push notifications before logout
      if (pushNotificationService) {
        try {
          await pushNotificationService.unregisterPushNotifications();
        } catch (e) {
          console.log('Push notifications not available');
        }
      }
      await api.logout();
      await clearCachedUser();
    } finally {
      setUser(null);
    }
  }

  async function refreshUser() {
    try {
      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
      await cacheUser(currentUser);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
