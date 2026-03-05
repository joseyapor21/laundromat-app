import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';

const LAST_CLIPBOARD_KEY = 'last_checked_clipboard';
const DISMISSED_NUMBERS_KEY = 'dismissed_phone_numbers';

export interface Customer {
  _id: string;
  name: string;
  phoneNumber: string;
  credit?: number;
  address?: string;
}

export interface RecentCallerResult {
  found: boolean;
  customer?: Customer;
  phoneNumber?: string;
  isNewNumber?: boolean;
}

/**
 * Extract phone number from text
 * Handles various formats: (123) 456-7890, 123-456-7890, 1234567890, +1234567890
 */
function extractPhoneNumber(text: string): string | null {
  if (!text || text.length > 50) return null;

  // Remove all non-digit characters except +
  const cleaned = text.replace(/[^\d+]/g, '');

  // Check if it's a valid phone number (10-11 digits, optionally with +)
  const match = cleaned.match(/^\+?1?(\d{10})$/);
  if (match) {
    return match[1]; // Return the 10 digit number
  }

  return null;
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

class RecentCallerService {
  private lastCheckedClipboard: string | null = null;
  private dismissedNumbers: Set<string> = new Set();
  private appStateListener: any = null;
  private onRecentCallerFound: ((result: RecentCallerResult) => void) | null = null;

  async init() {
    // Load dismissed numbers from storage
    try {
      const dismissed = await SecureStore.getItemAsync(DISMISSED_NUMBERS_KEY);
      if (dismissed) {
        const parsed = JSON.parse(dismissed);
        this.dismissedNumbers = new Set(parsed);
      }

      const lastClipboard = await SecureStore.getItemAsync(LAST_CLIPBOARD_KEY);
      if (lastClipboard) {
        this.lastCheckedClipboard = lastClipboard;
      }
    } catch (e) {
      console.log('Failed to load recent caller state:', e);
    }
  }

  /**
   * Set the callback for when a recent caller is found
   */
  setOnRecentCallerFound(callback: ((result: RecentCallerResult) => void) | null) {
    this.onRecentCallerFound = callback;
  }

  /**
   * Start listening for app state changes to check clipboard
   */
  startListening() {
    if (this.appStateListener) return;

    this.appStateListener = AppState.addEventListener('change', this.handleAppStateChange);
  }

  /**
   * Stop listening for app state changes
   */
  stopListening() {
    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = null;
    }
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus) => {
    // Only check when app becomes active
    if (nextAppState === 'active') {
      // Small delay to allow clipboard to be ready
      setTimeout(() => this.checkClipboardForPhoneNumber(), 500);
    }
  };

  /**
   * Check clipboard for a phone number and look up customer
   */
  async checkClipboardForPhoneNumber(): Promise<RecentCallerResult | null> {
    try {
      // Check if clipboard has content
      const hasString = await Clipboard.hasStringAsync();
      if (!hasString) return null;

      const clipboardContent = await Clipboard.getStringAsync();
      if (!clipboardContent) return null;

      // Don't check the same content twice
      if (clipboardContent === this.lastCheckedClipboard) {
        return null;
      }

      // Extract phone number from clipboard
      const phoneNumber = extractPhoneNumber(clipboardContent);
      if (!phoneNumber) return null;

      // Check if this number was dismissed
      if (this.dismissedNumbers.has(phoneNumber)) {
        return null;
      }

      // Update last checked
      this.lastCheckedClipboard = clipboardContent;
      await SecureStore.setItemAsync(LAST_CLIPBOARD_KEY, clipboardContent);

      // Look up customer by phone number
      const result = await this.lookupCustomerByPhone(phoneNumber);

      // Notify callback
      if (this.onRecentCallerFound && result) {
        this.onRecentCallerFound(result);
      }

      return result;
    } catch (error) {
      console.error('Error checking clipboard:', error);
      return null;
    }
  }

  /**
   * Look up a customer by phone number
   */
  async lookupCustomerByPhone(phoneNumber: string): Promise<RecentCallerResult> {
    try {
      const normalized = normalizePhone(phoneNumber);

      // Search for customer
      const customers = await api.searchCustomers(phoneNumber);

      // Find exact match
      const customer = customers.find((c: Customer) =>
        normalizePhone(c.phoneNumber) === normalized
      );

      if (customer) {
        return {
          found: true,
          customer,
          phoneNumber: normalized,
          isNewNumber: false,
        };
      }

      // No customer found - it's a new number
      return {
        found: false,
        phoneNumber: normalized,
        isNewNumber: true,
      };
    } catch (error) {
      console.error('Error looking up customer:', error);
      return {
        found: false,
        phoneNumber,
        isNewNumber: true,
      };
    }
  }

  /**
   * Dismiss a phone number so it won't be shown again
   */
  async dismissPhoneNumber(phoneNumber: string) {
    const normalized = normalizePhone(phoneNumber);
    this.dismissedNumbers.add(normalized);

    // Only keep the last 100 dismissed numbers
    if (this.dismissedNumbers.size > 100) {
      const arr = Array.from(this.dismissedNumbers);
      this.dismissedNumbers = new Set(arr.slice(-100));
    }

    try {
      await SecureStore.setItemAsync(
        DISMISSED_NUMBERS_KEY,
        JSON.stringify(Array.from(this.dismissedNumbers))
      );
    } catch (e) {
      console.log('Failed to save dismissed numbers:', e);
    }
  }

  /**
   * Clear the last checked clipboard so next check will work
   */
  clearLastChecked() {
    this.lastCheckedClipboard = null;
  }

  /**
   * Format phone number for display
   */
  formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '').slice(-10);
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  }
}

export const recentCallerService = new RecentCallerService();
