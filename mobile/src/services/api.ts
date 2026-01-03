import * as SecureStore from 'expo-secure-store';
import type { Order, Customer, User, Settings, ExtraItem, Machine, ActivityLog } from '../types';

// Update this to your actual API URL
const API_BASE_URL = __DEV__
  ? 'http://192.168.1.100:3000' // Local development - update with your computer's IP
  : 'https://your-production-url.com'; // Production URL

const AUTH_TOKEN_KEY = 'auth_token';

class ApiService {
  private token: string | null = null;

  async init() {
    this.token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  }

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
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

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Cookie'] = `auth-token=${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const response = await this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await this.setToken(response.token);
    return response;
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

  // Activity Logs
  async getActivityLogs(limit: number = 50): Promise<{ logs: ActivityLog[] }> {
    return this.request<{ logs: ActivityLog[] }>(`/activity-logs?limit=${limit}`);
  }

  // Users (Admin)
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }
}

export const api = new ApiService();
export default api;
