import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { syncAllCustomersToContacts } from './contactsSync';
import { api } from './api';

const BACKGROUND_SYNC_TASK = 'CONTACTS_BACKGROUND_SYNC';

// Define the background task
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    // Only sync if user is authenticated
    if (!api.getToken()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await api.init();
    const customers = await api.getCustomers();
    if (customers?.length) {
      const result = await syncAllCustomersToContacts(customers);
      console.log('[BackgroundSync] Done:', result);
      if (result.added > 0) {
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.log('[BackgroundSync] Error:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register the background fetch task
export async function registerBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) return;

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 60 * 60, // 1 hour minimum
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('[BackgroundSync] Registered');
  } catch (e) {
    console.log('[BackgroundSync] Registration failed:', e);
  }
}

// Unregister when logging out
export async function unregisterBackgroundSync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      console.log('[BackgroundSync] Unregistered');
    }
  } catch (e) {
    console.log('[BackgroundSync] Unregister failed:', e);
  }
}
