import { NativeModules, Platform } from 'react-native';

const { CallerIDModule } = NativeModules;

console.log('CallerIDModule available:', CallerIDModule !== null, CallerIDModule);

export interface CallerIDCustomer {
  id: string;
  name: string;
  phoneNumber: string;
}

export interface SyncResult {
  synced: number;
  reloaded: boolean;
  error?: string;
}

export interface ExtensionStatus {
  status: 'enabled' | 'disabled' | 'unknown';
}

class CallerIDService {
  /**
   * Check if Caller ID is available (iOS only)
   */
  isAvailable(): boolean {
    return Platform.OS === 'ios' && CallerIDModule !== null;
  }

  /**
   * Sync customer phone numbers to the iOS Call Directory Extension
   * This allows iOS to display customer names on incoming calls
   */
  async syncCustomers(customers: CallerIDCustomer[]): Promise<SyncResult> {
    console.log('CallerID syncCustomers called with', customers.length, 'customers');
    if (!this.isAvailable()) {
      console.log('CallerID not available');
      return { synced: 0, reloaded: false, error: 'Caller ID not available on this platform' };
    }

    try {
      console.log('Calling CallerIDModule.syncCustomers...');
      const result = await CallerIDModule.syncCustomers(customers);
      console.log('CallerID sync result:', result);
      return result;
    } catch (error: any) {
      console.error('Failed to sync caller ID:', error);
      return { synced: 0, reloaded: false, error: error.message };
    }
  }

  /**
   * Get the current status of the Call Directory Extension
   */
  async getExtensionStatus(): Promise<ExtensionStatus> {
    console.log('CallerID getExtensionStatus called, available:', this.isAvailable());
    if (!this.isAvailable()) {
      return { status: 'unknown' };
    }

    try {
      console.log('Calling CallerIDModule.getExtensionStatus...');
      const result = await CallerIDModule.getExtensionStatus();
      console.log('CallerID extension status:', result);
      return result;
    } catch (error: any) {
      console.error('Failed to get extension status:', error);
      return { status: 'unknown' };
    }
  }

  /**
   * Open iOS Settings to enable the Call Directory Extension
   */
  async openSettings(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      return await CallerIDModule.openSettings();
    } catch (error: any) {
      console.error('Failed to open settings:', error);
      return false;
    }
  }

  /**
   * Check if there was a recent incoming call (within last 5 minutes)
   * This is used to detect when the user opens the app after receiving a call
   */
  async hasRecentIncomingCall(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      return await CallerIDModule.hasRecentIncomingCall();
    } catch (error: any) {
      console.error('Failed to check recent call:', error);
      return false;
    }
  }

  /**
   * Clear the recent incoming call flag
   * Call this after the user has handled the recent call prompt
   */
  async clearRecentCall(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      await CallerIDModule.clearRecentCall();
    } catch (error: any) {
      console.error('Failed to clear recent call:', error);
    }
  }
}

export const callerIDService = new CallerIDService();
