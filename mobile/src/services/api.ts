import * as SecureStore from 'expo-secure-store';
import type { Order, Customer, User, Settings, ExtraItem, Machine, ActivityLog, OrderStatus, PaymentMethod } from '../types';

const API_BASE_URL = 'https://cloud.homation.us';

const AUTH_TOKEN_KEY = 'auth_token';

class ApiService {
  private token: string | null = null;

  async init() {
    this.token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
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

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        console.log('API Error:', response.status, errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
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
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
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

    return { token: data.token, user: data.user };
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      await this.clearToken();
    }
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/auth/me');
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

  async addCustomerCredit(id: string, amount: number, description: string): Promise<Customer> {
    return this.request<Customer>(`/customers/${id}/credit`, {
      method: 'POST',
      body: JSON.stringify({ amount, type: 'add', description }),
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

  // Machines
  async getMachines(): Promise<Machine[]> {
    return this.request<Machine[]>('/machines');
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

  async checkMachine(orderId: string, machineId: string, checkerInitials: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/machines/check', {
      method: 'POST',
      body: JSON.stringify({ orderId, machineId, checkerInitials }),
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

  // Users (Admin)
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }

  // Printing
  async printOrder(orderId: string, type: 'customer' | 'store' | 'both' = 'both'): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/orders/${orderId}/print`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  }

  async printDirect(content: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/print', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async queuePrintJob(content: string, priority: string = 'normal'): Promise<{ jobId: string }> {
    return this.request<{ jobId: string }>('/print-jobs/queue', {
      method: 'POST',
      body: JSON.stringify({ content, printerId: 'main', priority }),
    });
  }

  async printBagLabels(orderId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/orders/${orderId}/print-labels`, {
      method: 'POST',
    });
  }

  async printSingleBagLabel(orderId: string, bagIndex: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/orders/${orderId}/print-labels`, {
      method: 'POST',
      body: JSON.stringify({ bagIndex }),
    });
  }

  // Folding Check (Admin only)
  async checkFolding(orderId: string, bagIdentifier: string, checkerInitials: string): Promise<{ success: boolean; message: string; order: Order }> {
    return this.request<{ success: boolean; message: string; order: Order }>(`/orders/${orderId}/folding-check`, {
      method: 'POST',
      body: JSON.stringify({ bagIdentifier, checkerInitials }),
    });
  }

  async uncheckFolding(orderId: string, bagIdentifier: string): Promise<{ success: boolean; message: string; order: Order }> {
    return this.request<{ success: boolean; message: string; order: Order }>(`/orders/${orderId}/folding-check`, {
      method: 'DELETE',
      body: JSON.stringify({ bagIdentifier }),
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
  }): Promise<{ logs: ActivityLog[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.offset) searchParams.append('offset', params.offset.toString());
    if (params?.action) searchParams.append('action', params.action);
    if (params?.entityType) searchParams.append('entityType', params.entityType);

    const query = searchParams.toString();
    return this.request<{ logs: ActivityLog[]; total: number }>(`/activity-logs${query ? `?${query}` : ''}`);
  }
}

export const api = new ApiService();
export default api;
