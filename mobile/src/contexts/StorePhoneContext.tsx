import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { api } from '../services/api';

const STORE_PHONE_DEVICE_ID_KEY = 'store_phone_device_id';
const STORE_PHONE_MODE_KEY = 'store_phone_mode';
const CALLERID_DEVICE_ID_KEY = 'callerid_device_id';

interface StorePhoneDevice {
  deviceId: string;
  deviceName: string;
  locationName?: string;
  registeredAt: string;
  isStorePhone?: boolean;
}

interface StorePhoneContextType {
  isStorePhoneMode: boolean;
  isCheckingDevice: boolean;
  deviceInfo: StorePhoneDevice | null;
  checkStorePhoneMode: () => Promise<boolean>;
  enableStorePhoneMode: () => Promise<void>;
  disableStorePhoneMode: () => Promise<void>;
}

const StorePhoneContext = createContext<StorePhoneContextType | undefined>(undefined);

export function StorePhoneProvider({ children }: { children: ReactNode }) {
  const [isStorePhoneMode, setIsStorePhoneMode] = useState(false);
  const [isCheckingDevice, setIsCheckingDevice] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<StorePhoneDevice | null>(null);

  // Get device ID - use existing CallerID device ID if available
  const getDeviceId = useCallback(async (): Promise<string | null> => {
    // First check for CallerID device ID (already registered devices)
    let deviceId = await SecureStore.getItemAsync(CALLERID_DEVICE_ID_KEY);
    if (deviceId) return deviceId;

    // Fallback to store phone device ID
    deviceId = await SecureStore.getItemAsync(STORE_PHONE_DEVICE_ID_KEY);
    if (deviceId) return deviceId;

    // No device ID found - device is not registered
    return null;
  }, []);

  // Check if this device is registered as a store phone
  const checkStorePhoneMode = useCallback(async (): Promise<boolean> => {
    setIsCheckingDevice(true);
    try {
      const deviceId = await getDeviceId();

      // If no device ID, device is not registered
      if (!deviceId) {
        setIsStorePhoneMode(false);
        setDeviceInfo(null);
        await SecureStore.deleteItemAsync(STORE_PHONE_MODE_KEY);
        return false;
      }

      const result = await api.checkCallerIdDevice(deviceId);

      if (result.isRegistered && result.isStorePhone) {
        setIsStorePhoneMode(true);
        setDeviceInfo(result.device || null);
        await SecureStore.setItemAsync(STORE_PHONE_MODE_KEY, 'true');
        console.log('Store phone mode enabled for device:', deviceId);
        return true;
      } else {
        setIsStorePhoneMode(false);
        setDeviceInfo(null);
        await SecureStore.deleteItemAsync(STORE_PHONE_MODE_KEY);
        return false;
      }
    } catch (error) {
      console.log('Error checking store phone mode:', error);
      // Check local storage as fallback
      const localMode = await SecureStore.getItemAsync(STORE_PHONE_MODE_KEY);
      if (localMode === 'true') {
        setIsStorePhoneMode(true);
      }
      return localMode === 'true';
    } finally {
      setIsCheckingDevice(false);
    }
  }, [getDeviceId]);

  // Enable store phone mode
  const enableStorePhoneMode = useCallback(async () => {
    setIsStorePhoneMode(true);
    await SecureStore.setItemAsync(STORE_PHONE_MODE_KEY, 'true');
  }, []);

  // Disable store phone mode
  const disableStorePhoneMode = useCallback(async () => {
    setIsStorePhoneMode(false);
    setDeviceInfo(null);
    await SecureStore.deleteItemAsync(STORE_PHONE_MODE_KEY);
  }, []);

  // Check on mount and whenever token changes
  useEffect(() => {
    // Only check if we have a token (user is authenticated)
    const token = api.getToken();
    if (token) {
      checkStorePhoneMode();
    } else {
      setIsCheckingDevice(false);
    }
  }, [checkStorePhoneMode]);

  return (
    <StorePhoneContext.Provider
      value={{
        isStorePhoneMode,
        isCheckingDevice,
        deviceInfo,
        checkStorePhoneMode,
        enableStorePhoneMode,
        disableStorePhoneMode,
      }}
    >
      {children}
    </StorePhoneContext.Provider>
  );
}

export function useStorePhone() {
  const context = useContext(StorePhoneContext);
  if (context === undefined) {
    throw new Error('useStorePhone must be used within a StorePhoneProvider');
  }
  return context;
}
