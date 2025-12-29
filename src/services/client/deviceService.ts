'use client';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  error?: GeolocationPositionError;
}

interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

interface BatteryStatus {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

interface NetworkStatus {
  online: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  cookieEnabled: boolean;
  onLine: boolean;
  hardwareConcurrency: number;
  maxTouchPoints: number;
  deviceMemory?: number;
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    pixelDepth: number;
  };
  window: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}

interface Permissions {
  camera: boolean;
  location: boolean;
  notifications: boolean;
  orientation: boolean;
}

// Extend Navigator type for non-standard APIs
declare global {
  interface Navigator {
    getBattery?: () => Promise<{
      level: number;
      charging: boolean;
      chargingTime: number;
      dischargingTime: number;
    }>;
    connection?: {
      effectiveType: string;
      downlink: number;
      rtt: number;
      saveData: boolean;
    };
    deviceMemory?: number;
    standalone?: boolean;
  }

  interface DeviceOrientationEvent {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  }
}

export class DeviceService {
  async requestCamera(): Promise<MediaStream> {
    if (typeof navigator === 'undefined') {
      throw new Error('Not in browser environment');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera not supported on this device');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    return stream;
  }

  async takePhoto(): Promise<string> {
    const stream = await this.requestCamera();

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        stream.getTracks().forEach((track) => track.stop());
        reject(new Error('Canvas context not available'));
        return;
      }

      video.srcObject = stream;
      video.play();

      video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        setTimeout(() => {
          context.drawImage(video, 0, 0);
          const imageData = canvas.toDataURL('image/jpeg', 0.8);
          stream.getTracks().forEach((track) => track.stop());
          resolve(imageData);
        }, 1000);
      });

      video.addEventListener('error', () => {
        stream.getTracks().forEach((track) => track.stop());
        reject(new Error('Video error'));
      });
    });
  }

  async getCurrentLocation(options: PositionOptions = {}): Promise<LocationData> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation not supported on this device');
    }

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000,
    };

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          });
        },
        (error) => {
          console.error('Location access denied:', error);
          reject(error);
        },
        { ...defaultOptions, ...options }
      );
    });
  }

  watchLocation(callback: (data: LocationData) => void, options: PositionOptions = {}): number {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation not supported on this device');
    }

    const defaultOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    };

    return navigator.geolocation.watchPosition(
      (position) => {
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        console.error('Location watch error:', error);
        callback({ error, latitude: 0, longitude: 0, accuracy: 0, timestamp: 0 });
      },
      { ...defaultOptions, ...options }
    );
  }

  stopWatchingLocation(watchId: number): void {
    if (typeof navigator !== 'undefined' && navigator.geolocation && watchId) {
      navigator.geolocation.clearWatch(watchId);
    }
  }

  async shareContent(data: ShareData): Promise<{ success: boolean; message?: string }> {
    if (typeof navigator === 'undefined') {
      throw new Error('Not in browser environment');
    }

    if (!navigator.share) {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(data.text || data.url || '');
        return { success: true, message: 'Copied to clipboard' };
      }
      throw new Error('Sharing not supported on this device');
    }

    try {
      await navigator.share(data);
      return { success: true };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { success: false, message: 'Share cancelled' };
      }
      throw error;
    }
  }

  vibrate(pattern: number | number[] = [200]): boolean {
    if (typeof navigator === 'undefined' || !navigator.vibrate) {
      return false;
    }

    try {
      navigator.vibrate(pattern);
      return true;
    } catch {
      return false;
    }
  }

  async requestOrientationPermission(): Promise<boolean> {
    if (typeof DeviceOrientationEvent === 'undefined') {
      return true;
    }

    const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DOE.requestPermission === 'function') {
      try {
        const permission = await DOE.requestPermission();
        return permission === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  async getBatteryStatus(): Promise<BatteryStatus | null> {
    if (typeof navigator === 'undefined' || !navigator.getBattery) {
      return null;
    }

    try {
      const battery = await navigator.getBattery();
      return {
        level: battery.level * 100,
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime,
      };
    } catch {
      return null;
    }
  }

  getNetworkStatus(): NetworkStatus {
    if (typeof navigator === 'undefined') {
      return { online: true };
    }

    if (navigator.connection) {
      return {
        online: navigator.onLine,
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData,
      };
    }
    return { online: navigator.onLine };
  }

  getDeviceInfo(): DeviceInfo | null {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return null;
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      deviceMemory: navigator.deviceMemory,
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        pixelDepth: screen.pixelDepth,
      },
      window: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
    };
  }

  async pickFile(accept = '*/*', multiple = false): Promise<File[]> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;

      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        if (files.length > 0) {
          resolve(files);
        } else {
          reject(new Error('No file selected'));
        }
      });

      input.addEventListener('cancel', () => {
        reject(new Error('File selection cancelled'));
      });

      input.click();
    });
  }

  async requestAllPermissions(): Promise<Permissions> {
    const permissions: Permissions = {
      camera: false,
      location: false,
      notifications: false,
      orientation: false,
    };

    try {
      try {
        const stream = await this.requestCamera();
        stream.getTracks().forEach((track) => track.stop());
        permissions.camera = true;
      } catch {
        console.log('Camera permission denied');
      }

      try {
        await this.getCurrentLocation();
        permissions.location = true;
      } catch {
        console.log('Location permission denied');
      }

      try {
        if (typeof Notification !== 'undefined') {
          const permission = await Notification.requestPermission();
          permissions.notifications = permission === 'granted';
        }
      } catch {
        console.log('Notification permission denied');
      }

      try {
        permissions.orientation = await this.requestOrientationPermission();
      } catch {
        console.log('Orientation permission denied');
      }
    } catch (error) {
      console.error('Permission request error:', error);
    }

    return permissions;
  }

  isPWA(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  isMobile(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  isAndroid(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Android/.test(navigator.userAgent);
  }
}

export const deviceService = new DeviceService();
