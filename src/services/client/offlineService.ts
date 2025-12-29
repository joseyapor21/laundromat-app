'use client';

interface OfflineOrder {
  id: string;
  timestamp: Date;
  synced: boolean;
  [key: string]: unknown;
}

class OfflineService {
  private dbName = 'LaundromateOfflineDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  private get isSupported(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  async init(): Promise<IDBDatabase | null> {
    if (!this.isSupported) {
      console.warn('IndexedDB not supported');
      return null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('orders')) {
          const ordersStore = db.createObjectStore('orders', { keyPath: 'id' });
          ordersStore.createIndex('timestamp', 'timestamp');
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  async saveOrderOffline(order: Record<string, unknown>): Promise<OfflineOrder> {
    if (!this.db) await this.init();
    if (!this.db) throw new Error('IndexedDB not available');

    const transaction = this.db.transaction(['orders'], 'readwrite');
    const store = transaction.objectStore('orders');

    const offlineOrder: OfflineOrder = {
      ...order,
      id: `offline_${Date.now()}`,
      timestamp: new Date(),
      synced: false,
    };

    return new Promise((resolve, reject) => {
      const request = store.add(offlineOrder);
      request.onsuccess = () => resolve(offlineOrder);
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineOrders(): Promise<OfflineOrder[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    const transaction = this.db.transaction(['orders'], 'readonly');
    const store = transaction.objectStore('orders');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as OfflineOrder[]);
      request.onerror = () => reject(request.error);
    });
  }

  async syncOfflineOrders(): Promise<void> {
    const offlineOrders = await this.getOfflineOrders();
    const unsyncedOrders = offlineOrders.filter((order) => !order.synced);

    for (const order of unsyncedOrders) {
      try {
        const { id, synced, timestamp, ...orderData } = order;
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        });

        if (response.ok) {
          await this.markOrderSynced(id);
        }
      } catch (error) {
        console.log('Sync failed for order:', order.id, error);
      }
    }
  }

  async markOrderSynced(orderId: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['orders'], 'readwrite');
    const store = transaction.objectStore('orders');

    return new Promise((resolve, reject) => {
      const getRequest = store.get(orderId);
      getRequest.onsuccess = () => {
        const order = getRequest.result;
        if (order) {
          order.synced = true;
          const updateRequest = store.put(order);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteOrderOffline(orderId: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    const transaction = this.db.transaction(['orders'], 'readwrite');
    const store = transaction.objectStore('orders');

    return new Promise((resolve, reject) => {
      const request = store.delete(orderId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
}

export const offlineService = new OfflineService();
