import * as SecureStore from 'expo-secure-store';
import type { Order, Customer, User, Settings, ExtraItem, Machine, ActivityLog, OrderStatus, PaymentMethod, TimeEntry, ClockStatus, Location, LocationVaultItem, VaultDocument } from '../types';

const API_BASE_URL = 'https://cloud.homation.us';

const AUTH_TOKEN_KEY = 'auth_token';
const LOCATION_ID_KEY = 'location_id';

class ApiService {
  private token: string | null = null;
  private locationId: string | null = null;

  async init() {
    this.token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    this.locationId = await SecureStore.getItemAsync(LOCATION_ID_KEY);
  }

  async setToken(token: string | undefined | null) {
    if (token && typeof token === 'string') {
      this.token = token;
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    }
  }

  async clearToken() {
    this.token = null;
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  }

  getToken() {
    return this.token;
  }

  getBaseUrl() {
    return API_BASE_URL;
  }

  // Location ID methods
  async setLocationId(locationId: string | null) {
    this.locationId = locationId;
    if (locationId) {
      await SecureStore.setItemAsync(LOCATION_ID_KEY, locationId);
    } else {
      await SecureStore.deleteItemAsync(LOCATION_ID_KEY);
    }
  }

  async clearLocationId() {
    this.locationId = null;
    await SecureStore.deleteItemAsync(LOCATION_ID_KEY);
  }

  getLocationId() {
    return this.locationId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}/api${endpoint}`;
    console.log('API Request:', options.method || 'GET', url);

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    // Add location header if set
    if (this.locationId) {
      (headers as Record<string, string>)['X-Location-Id'] = this.locationId;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        console.log('API Error:', response.status, errorData);
        // Create error with additional data attached
        const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`) as any;
        error.status = response.status;
        error.invalidAddresses = errorData.invalidAddresses;
        error.debug = errorData.debug;
        error.requireConfirmation = errorData.requireConfirmation;
        throw error;
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Network request failed') {
        console.error('Network error - check if server is running and accessible');
        throw new Error('Cannot connect to server. Check your network connection.');
      }
      throw error;
    }
  }

  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User; locations: Location[] }> {
    const url = `${API_BASE_URL}/api/auth/login`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();

    if (data.token) {
      await this.setToken(data.token);
    }

    return { token: data.token, user: data.user, locations: data.locations || [] };
  }

  // Locations
  async getLocations(): Promise<Location[]> {
    return this.request<Location[]>('/locations');
  }

  async createLocation(data: Partial<Location>): Promise<Location> {
    return this.request<Location>('/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLocation(id: string, data: Partial<Location>): Promise<Location> {
    return this.request<Location>(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLocation(id: string): Promise<void> {
    return this.request(`/locations/${id}`, { method: 'DELETE' });
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      await this.clearToken();
      await this.clearLocationId();
    }
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // Profile
  async getProfile(): Promise<User & { pushNotificationsEnabled?: boolean }> {
    return this.request<User & { pushNotificationsEnabled?: boolean }>('/profile');
  }

  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    currentPassword?: string;
    newPassword?: string;
    pushNotificationsEnabled?: boolean;
  }): Promise<{ message: string; user: User }> {
    return this.request<{ message: string; user: User }>('/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Orders
  async getOrders(): Promise<Order[]> {
    return this.request<Order[]>('/orders');
  }

  async getOrder(id: string): Promise<Order> {
    return this.request<Order>(`/orders/${id}`);
  }

  async createOrder(order: Partial<Order>): Promise<Order> {
    return this.request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async updateOrder(id: string, updates: Partial<Order>): Promise<Order> {
    return this.request<Order>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    return this.request<Order>(`/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async deleteOrder(id: string): Promise<void> {
    await this.request(`/orders/${id}`, { method: 'DELETE' });
  }

  async markOrderAsPaid(id: string, paymentMethod?: string): Promise<Order> {
    return this.request<Order>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isPaid: true, paymentMethod: paymentMethod || 'cash' }),
    });
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    return this.request<Customer[]>('/customers');
  }

  async getCustomer(id: string): Promise<Customer> {
    return this.request<Customer>(`/customers/${id}`);
  }

  async createCustomer(customer: Partial<Customer>): Promise<Customer> {
    return this.request<Customer>('/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  }

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    return this.request<Customer>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Search customers from other locations
  async searchCustomersOtherLocations(query: string): Promise<(Customer & { locationName: string })[]> {
    return this.request<(Customer & { locationName: string })[]>(`/customers/search-all?q=${encodeURIComponent(query)}`);
  }

  // Copy customer from another location to current location
  async copyCustomerToLocation(sourceCustomerId: string): Promise<{
    message: string;
    customer: Customer;
  }> {
    return this.request<{ message: string; customer: Customer }>('/customers/copy', {
      method: 'POST',
      body: JSON.stringify({ sourceCustomerId }),
    });
  }

  // Address verification / autocomplete
  async verifyAddress(address: string): Promise<{
    verified: boolean;
    error?: string;
    bestMatch?: {
      displayName: string;
      formattedAddress: string;
      latitude: number;
      longitude: number;
      placeId?: string;
    };
    suggestions: Array<{
      displayName: string;
      formattedAddress: string;
      latitude: number;
      longitude: number;
      placeId?: string;
      secondaryText?: string;
    }>;
  }> {
    return this.request('/address/verify', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  // Get place details by placeId
  async getPlaceDetails(placeId: string): Promise<{
    verified: boolean;
    error?: string;
    bestMatch?: {
      displayName: string;
      formattedAddress: string;
      latitude: number;
      longitude: number;
      placeId: string;
      components?: {
        streetNumber: string;
        street: string;
        subpremise: string;
        city: string;
        state: string;
        zipCode: string;
        country: string;
      };
    };
    suggestions: Array<{
      displayName: string;
      formattedAddress: string;
      latitude: number;
      longitude: number;
      placeId: string;
    }>;
  }> {
    return this.request('/address/verify', {
      method: 'POST',
      body: JSON.stringify({ placeId }),
    });
  }

  async getCustomerOrders(customerId: string): Promise<Order[]> {
    return this.request<Order[]>(`/customers/${customerId}/orders`);
  }

  async addCustomerCredit(id: string, amount: number, description: string): Promise<Customer> {
    return this.request<Customer>(`/customers/${id}/credit`, {
      method: 'POST',
      body: JSON.stringify({ amount, type: 'add', description }),
    });
  }

  async useCustomerCredit(id: string, amount: number, description: string): Promise<Customer> {
    return this.request<Customer>(`/customers/${id}/credit`, {
      method: 'POST',
      body: JSON.stringify({ amount, type: 'use', description }),
    });
  }

  // Settings
  async getSettings(): Promise<Settings> {
    return this.request<Settings>('/settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    return this.request<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Extra Items
  async getExtraItems(): Promise<ExtraItem[]> {
    return this.request<ExtraItem[]>('/extra-items');
  }

  async createExtraItem(item: Partial<ExtraItem>): Promise<ExtraItem> {
    return this.request<ExtraItem>('/extra-items', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  async updateExtraItem(id: string, updates: Partial<ExtraItem>): Promise<ExtraItem> {
    return this.request<ExtraItem>(`/extra-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteExtraItem(id: string): Promise<void> {
    await this.request(`/extra-items/${id}`, { method: 'DELETE' });
  }

  async getLocationsForCopy(): Promise<{ locations: { _id: string; name: string; code: string; extraItemCount: number }[] }> {
    return this.request('/extra-items/copy');
  }

  async copyExtraItems(sourceLocationId: string, targetLocationId: string): Promise<{
    message: string;
    copied: number;
    skipped: number;
    copiedItems: string[];
    skippedItems: string[];
  }> {
    return this.request('/extra-items/copy', {
      method: 'POST',
      body: JSON.stringify({ sourceLocationId, targetLocationId }),
    });
  }

  // Machines
  async getMachines(): Promise<Machine[]> {
    return this.request<Machine[]>('/machines');
  }

  async createMachine(data: { name: string; type: string; qrCode: string }): Promise<Machine> {
    return this.request<Machine>('/machines', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMachine(id: string, updates: Partial<Machine>): Promise<Machine> {
    return this.request<Machine>(`/machines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async scanMachine(qrCode: string, orderId: string): Promise<{ message: string; machine: Machine; order: Order }> {
    return this.request<{ message: string; machine: Machine; order: Order }>('/machines/scan', {
      method: 'POST',
      body: JSON.stringify({ qrCode, orderId }),
    });
  }

  async uploadMachinePhoto(orderId: string, machineId: string, photoBase64: string): Promise<{ success: boolean; message: string; photoPath: string; order: Order }> {
    return this.request<{ success: boolean; message: string; photoPath: string; order: Order }>(`/orders/${orderId}/machine-photo`, {
      method: 'POST',
      body: JSON.stringify({ machineId, photoBase64 }),
    });
  }

  async checkMachine(orderId: string, machineId: string, checkerInitials: string, forceSamePerson?: boolean): Promise<{ success: boolean; message: string; requireConfirmation?: boolean }> {
    return this.request<{ success: boolean; message: string; requireConfirmation?: boolean }>('/machines/check', {
      method: 'POST',
      body: JSON.stringify({ orderId, machineId, checkerInitials, forceSamePerson }),
    });
  }

  async uncheckMachine(orderId: string, machineId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/machines/uncheck', {
      method: 'POST',
      body: JSON.stringify({ orderId, machineId }),
    });
  }

  async releaseMachine(machineId: string, orderId: string): Promise<{ message: string; order: Order }> {
    return this.request<{ message: string; order: Order }>('/machines/release', {
      method: 'POST',
      body: JSON.stringify({ machineId, orderId }),
    });
  }

  async unloadDryer(orderId: string, machineId: string, initials: string): Promise<{ success: boolean; message: string; order: Order }> {
    return this.request<{ success: boolean; message: string; order: Order }>('/machines/unload', {
      method: 'POST',
      body: JSON.stringify({ orderId, machineId, initials }),
    });
  }

  async checkDryerUnload(orderId: string, machineId: string, initials: string, forceSamePerson?: boolean): Promise<{ success: boolean; message: string; order: Order; requireConfirmation?: boolean }> {
    return this.request<{ success: boolean; message: string; order: Order; requireConfirmation?: boolean }>('/machines/unload-check', {
      method: 'POST',
      body: JSON.stringify({ orderId, machineId, initials, forceSamePerson }),
    });
  }

  // Users (Admin)
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }

  async inviteUser(data: {
    email: string;
    firstName: string;
    lastName?: string;
    role: string;
    isDriver?: boolean;
    temporaryPassword: string;
  }): Promise<{ message: string; user: User }> {
    return this.request<{ message: string; user: User }>('/users/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return this.request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Layering verification (verifies dryer/layering complete and moves to folding status)
  async verifyLayeringComplete(orderId: string, checkedBy: string, checkedByInitials: string, forceSamePerson?: boolean): Promise<{ success: boolean; message: string; order: Order }> {
    return this.request<{ success: boolean; message: string; order: Order }>(`/orders/${orderId}/layering-check`, {
      method: 'POST',
      body: JSON.stringify({ checkedBy, checkedByInitials, forceSamePerson }),
    });
  }

  // Order-level folding verification (verifies folding complete and moves to ready status)
  async verifyFoldingComplete(orderId: string, checkedBy: string, checkedByInitials: string): Promise<{ success: boolean; message: string; order: Order }> {
    return this.request<{ success: boolean; message: string; order: Order }>(`/orders/${orderId}/fold-check`, {
      method: 'POST',
      body: JSON.stringify({ checkedBy, checkedByInitials }),
    });
  }

  // Transfer order from washer to dryer
  async transferOrder(orderId: string): Promise<{ success: boolean; message: string; order: Order }> {
    return this.request<{ success: boolean; message: string; order: Order }>(`/orders/${orderId}/transfer`, {
      method: 'POST',
    });
  }

  // Verify transfer (different person check)
  async verifyTransfer(orderId: string, forceSamePerson?: boolean): Promise<{ success: boolean; message: string; order: Order; requireConfirmation?: boolean }> {
    return this.request<{ success: boolean; message: string; order: Order; requireConfirmation?: boolean }>(`/orders/${orderId}/transfer-check`, {
      method: 'POST',
      body: JSON.stringify({ forceSamePerson }),
    });
  }

  // Final check before marking ready (with optional re-weigh)
  async finalCheck(orderId: string, finalWeight?: number, forceSamePerson?: boolean): Promise<{ success: boolean; message: string; order: Order; requireConfirmation?: boolean }> {
    return this.request<{ success: boolean; message: string; order: Order; requireConfirmation?: boolean }>(`/orders/${orderId}/final-check`, {
      method: 'POST',
      body: JSON.stringify({ finalWeight, forceSamePerson }),
    });
  }

  // Air Dry Items
  async addAirDryItem(orderId: string, data: { photo: string; description?: string; taggedBy: string; taggedByInitials?: string }): Promise<{ success: boolean; message: string; airDryItem: AirDryItem }> {
    return this.request<{ success: boolean; message: string; airDryItem: AirDryItem }>(`/orders/${orderId}/air-dry`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async removeAirDryItem(orderId: string, itemId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/orders/${orderId}/air-dry`, {
      method: 'DELETE',
      body: JSON.stringify({ itemId }),
    });
  }

  // Print customer balance
  async printCustomerBalance(customerId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/customers/${customerId}/print-balance`, {
      method: 'POST',
    });
  }

  // Push Notifications
  async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/users/push-token', {
      method: 'POST',
      body: JSON.stringify({ pushToken: token, platform }),
    });
  }

  async unregisterPushToken(): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/users/push-token', {
      method: 'DELETE',
    });
  }

  // Activity Logs
  async getActivityLogs(params?: {
    limit?: number;
    offset?: number;
    action?: string;
    entityType?: string;
    userId?: string;
    locationId?: string;
  }): Promise<{ logs: ActivityLog[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.action) searchParams.append('action', params.action);
    if (params?.entityType) searchParams.append('entityType', params.entityType);
    if (params?.userId) searchParams.append('userId', params.userId);
    if (params?.locationId) searchParams.append('locationId', params.locationId);

    const query = searchParams.toString();
    return this.request<{ logs: ActivityLog[]; total: number }>(`/activity-logs${query ? `?${query}` : ''}`);
  }

  // Print receipt via POS thermal printer
  async printReceipt(content: string): Promise<{ success: boolean; error?: string }> {
    return this.request<{ success: boolean; error?: string }>('/print', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // Route optimization
  async optimizeRoute(stops: Array<{ address: string; orderId?: string; customerName?: string }>, storeAddress?: string): Promise<{
    optimizedStops: Array<{
      address: string;
      orderId?: string;
      customerName?: string;
      originalIndex: number;
      optimizedIndex: number;
    }>;
    totalDistance: { value: number; text: string };
    totalDuration: { value: number; text: string };
    legs: Array<{ distance: { value: number; text: string }; duration: { value: number; text: string } }>;
  }> {
    return this.request('/routes/optimize', {
      method: 'POST',
      body: JSON.stringify({ stops, storeAddress }),
    });
  }

  // Time Clock
  async getClockStatus(): Promise<ClockStatus> {
    return this.request<ClockStatus>('/time-entries/status');
  }

  async clockIn(data: {
    photo: string;
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
    deviceInfo?: string;
  }): Promise<TimeEntry> {
    return this.request<TimeEntry>('/time-entries', {
      method: 'POST',
      body: JSON.stringify({ type: 'clock_in', ...data }),
    });
  }

  async clockOut(data: {
    photo?: string;
    location: { latitude: number; longitude: number; accuracy?: number };
    notes?: string;
    deviceInfo?: string;
  }): Promise<TimeEntry> {
    return this.request<TimeEntry>('/time-entries', {
      method: 'POST',
      body: JSON.stringify({ type: 'clock_out', ...data }),
    });
  }

  async startBreak(data: {
    location: { latitude: number; longitude: number; accuracy?: number; address?: string };
    notes?: string;
    deviceInfo?: string;
    breakType?: 'breakfast' | 'lunch';
  }): Promise<TimeEntry> {
    return this.request<TimeEntry>('/time-entries', {
      method: 'POST',
      body: JSON.stringify({ type: 'break_start', ...data }),
    });
  }

  async endBreak(data: {
    location: { latitude: number; longitude: number; accuracy?: number; address?: string };
    notes?: string;
    deviceInfo?: string;
  }): Promise<TimeEntry> {
    return this.request<TimeEntry>('/time-entries', {
      method: 'POST',
      body: JSON.stringify({ type: 'break_end', ...data }),
    });
  }

  async getTimeEntries(params?: {
    userId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: TimeEntry[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());

    const query = searchParams.toString();
    return this.request<{ entries: TimeEntry[]; total: number }>(`/time-entries${query ? `?${query}` : ''}`);
  }

  getTimeEntryPhotoUrl(photoPath: string): string {
    const token = this.getToken();
    return `${API_BASE_URL}/api/uploads/${photoPath}${token ? `?token=${token}` : ''}`;
  }

  // Pickup Photos
  async uploadPickupPhoto(orderId: string, photo: string): Promise<{ success: boolean; photoPath: string }> {
    return this.request<{ success: boolean; photoPath: string }>(`/orders/${orderId}/pickup-photo`, {
      method: 'POST',
      body: JSON.stringify({ photo }),
    });
  }

  async getPickupPhotos(orderId: string): Promise<{ photos: Array<{ photoPath: string; capturedAt: string; capturedBy: string; capturedByName: string }> }> {
    return this.request<{ photos: Array<{ photoPath: string; capturedAt: string; capturedBy: string; capturedByName: string }> }>(`/orders/${orderId}/pickup-photo`);
  }

  getPickupPhotoUrl(photoPath: string): string {
    const tokenParam = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    return `${API_BASE_URL}/api/uploads/${photoPath}${tokenParam}`;
  }

  // Maintenance Photos
  async uploadMaintenancePhoto(machineId: string, photo: string): Promise<{ success: boolean; photoPath: string }> {
    return this.request<{ success: boolean; photoPath: string }>(`/machines/${machineId}/maintenance-photo`, {
      method: 'POST',
      body: JSON.stringify({ photo }),
    });
  }

  async getMaintenancePhotos(machineId: string): Promise<{ photos: Array<{ photoPath: string; capturedAt: string; capturedBy: string; capturedByName: string }> }> {
    return this.request<{ photos: Array<{ photoPath: string; capturedAt: string; capturedBy: string; capturedByName: string }> }>(`/machines/${machineId}/maintenance-photo`);
  }

  async clearMaintenancePhotos(machineId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/machines/${machineId}/maintenance-photo`, {
      method: 'DELETE',
    });
  }

  async deleteMaintenancePhoto(machineId: string, photoPath: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/machines/${machineId}/maintenance-photo?photoPath=${encodeURIComponent(photoPath)}`, {
      method: 'DELETE',
    });
  }

  getMaintenancePhotoUrl(photoPath: string): string {
    const tokenParam = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    return `${API_BASE_URL}/api/uploads/${photoPath}${tokenParam}`;
  }

  // Location Vault
  async getVaultItems(locationId: string, type?: string): Promise<LocationVaultItem[]> {
    const query = type && type !== 'all' ? `?type=${type}` : '';
    return this.request<LocationVaultItem[]>(`/locations/${locationId}/vault${query}`);
  }

  async createVaultItem(locationId: string, data: Partial<LocationVaultItem> & { password?: string; emailPassword?: string }): Promise<LocationVaultItem> {
    return this.request<LocationVaultItem>(`/locations/${locationId}/vault`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateVaultItem(locationId: string, itemId: string, data: Partial<LocationVaultItem> & { password?: string; emailPassword?: string }): Promise<LocationVaultItem> {
    return this.request<LocationVaultItem>(`/locations/${locationId}/vault/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteVaultItem(locationId: string, itemId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/locations/${locationId}/vault/${itemId}`, {
      method: 'DELETE',
    });
  }

  async revealVaultPassword(locationId: string, itemId: string): Promise<{ password?: string; emailPassword?: string }> {
    return this.request<{ password?: string; emailPassword?: string }>(`/locations/${locationId}/vault/${itemId}?reveal=true`);
  }

  async uploadVaultDocument(locationId: string, itemId: string, data: { fileName: string; fileType: string; base64: string }): Promise<{ success: boolean; document: VaultDocument }> {
    return this.request<{ success: boolean; document: VaultDocument }>(`/locations/${locationId}/vault/${itemId}/document`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteVaultDocument(locationId: string, itemId: string, filePath: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/locations/${locationId}/vault/${itemId}/document?filePath=${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    });
  }

  getVaultDocumentUrl(filePath: string): string {
    const tokenParam = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    return `${API_BASE_URL}/api/uploads/${filePath}${tokenParam}`;
  }

  // App Version Management
  async getAppVersionConfig(): Promise<{
    minVersion: string;
    latestVersion: string;
    updateMessage: string;
    forceUpdate: boolean;
    iosIpaPath?: string;
    iosIpaUploadedAt?: string;
    androidApkPath?: string;
    androidApkUploadedAt?: string;
  }> {
    return this.request('/app-version');
  }

  async updateAppVersionConfig(data: {
    minVersion?: string;
    latestVersion?: string;
    updateMessage?: string;
    forceUpdate?: boolean;
  }): Promise<{ success: boolean }> {
    return this.request('/app-version', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async uploadAppFile(platform: 'ios' | 'android', fileName: string, base64: string): Promise<{
    success: boolean;
    platform: string;
    path: string;
    uploadedAt: string;
  }> {
    return this.request('/app-version', {
      method: 'POST',
      body: JSON.stringify({ platform, fileName, base64 }),
    });
  }
}

export const api = new ApiService();
export default api;
