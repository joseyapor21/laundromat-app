'use client';

import { useEffect } from 'react';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { offlineService } from '@/services/client/offlineService';

export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const { isRegistered, updateAvailable, update } = useServiceWorker();

  // Handle offline sync events from service worker
  useEffect(() => {
    const handleSyncEvent = async () => {
      console.log('Received sync event from service worker');
      try {
        await offlineService.syncOfflineOrders();
      } catch (error) {
        console.error('Failed to sync offline orders:', error);
      }
    };

    window.addEventListener('sw-sync-offline', handleSyncEvent);

    // Also sync when coming back online
    const handleOnline = () => {
      if (navigator.onLine) {
        handleSyncEvent();
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('sw-sync-offline', handleSyncEvent);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Show update notification when available
  useEffect(() => {
    if (updateAvailable) {
      // Could show a toast or banner here
      console.log('App update available');
    }
  }, [updateAvailable]);

  return <>{children}</>;
}
