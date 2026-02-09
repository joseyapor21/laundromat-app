import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import type { User, Location } from '../types';

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

  async function initAuth() {
    try {
      await api.init();
      if (api.getToken()) {
        const currentUser = await api.getCurrentUser();
        setUser(currentUser);
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
    } catch (error) {
      console.log('Auth init error:', error);
      await api.clearToken();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<Location[]> {
    const { user: loggedInUser, locations } = await api.login(email, password);
    setUser(loggedInUser);

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
    } finally {
      setUser(null);
    }
  }

  async function refreshUser() {
    try {
      const currentUser = await api.getCurrentUser();
      setUser(currentUser);
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
