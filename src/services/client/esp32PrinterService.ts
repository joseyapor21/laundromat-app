'use client';

interface ESP32Status {
  wifi_connected: boolean;
  g5_connected: boolean;
  ip_address: string;
  device_name: string;
  status: string;
}

interface ConnectionResult {
  connected: boolean;
  esp32IP: string | null;
  g5Connected: boolean;
  autoDiscovered: boolean;
}

interface PrintResult {
  success: boolean;
  message: string;
  quantity?: number;
}

interface OrderData {
  orderId?: string | number;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  quantity?: number;
}

class ESP32PrinterService {
  private esp32IP: string | null = null;
  private isConnected = false;
  private autoDiscovered = false;

  async discoverESP32(): Promise<string> {
    const commonIPs: string[] = [];

    const baseIPs = ['192.168.1', '192.168.0', '10.0.0', '172.16.0'];

    for (const base of baseIPs) {
      for (let i = 1; i <= 254; i++) {
        commonIPs.push(`${base}.${i}`);
      }
    }

    console.log('Scanning for ESP32 printer bridge...');

    for (let i = 0; i < commonIPs.length; i += 20) {
      const batch = commonIPs.slice(i, i + 20);
      const promises = batch.map((ip) => this.testESP32Connection(ip));

      try {
        const results = await Promise.allSettled(promises);

        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'fulfilled' && (results[j] as PromiseFulfilledResult<boolean>).value) {
            this.esp32IP = batch[j];
            this.autoDiscovered = true;
            console.log(`Found ESP32 at: ${this.esp32IP}`);
            return this.esp32IP;
          }
        }
      } catch {
        // Continue scanning
      }
    }

    throw new Error('ESP32 printer bridge not found on network');
  }

  async testESP32Connection(ip: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await fetch(`http://${ip}:8080/status`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (Object.prototype.hasOwnProperty.call(data, 'g5_connected') ||
            Object.prototype.hasOwnProperty.call(data, 'wifi_connected')) {
          return true;
        }
      }
    } catch {
      // Ignore errors - just means this IP doesn't have our ESP32
    }

    return false;
  }

  async connect(providedIP: string | null = null): Promise<ConnectionResult> {
    if (providedIP) {
      this.esp32IP = providedIP;
      this.autoDiscovered = false;
    } else if (!this.esp32IP) {
      await this.discoverESP32();
    }

    const status = await this.getStatus();
    this.isConnected = status.wifi_connected;

    return {
      connected: this.isConnected,
      esp32IP: this.esp32IP,
      g5Connected: status.g5_connected,
      autoDiscovered: this.autoDiscovered,
    };
  }

  async getStatus(): Promise<ESP32Status> {
    if (!this.esp32IP) {
      throw new Error('ESP32 IP not set. Call connect() first.');
    }

    try {
      const response = await fetch(`http://${this.esp32IP}:8080/status`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status = await response.json();

      return {
        wifi_connected: status.wifi_connected || true,
        g5_connected: status.g5_connected || false,
        ip_address: status.ip_address || this.esp32IP,
        device_name: status.device_name || 'G5-40280365',
        status: status.status || (status.g5_connected ? 'ready' : 'printer_disconnected'),
      };
    } catch (error) {
      console.error('Failed to get ESP32 status:', error);
      throw new Error(`Failed to connect to ESP32: ${(error as Error).message}`);
    }
  }

  async connectToG5(): Promise<PrintResult> {
    if (!this.esp32IP) {
      throw new Error('ESP32 IP not set. Call connect() first.');
    }

    try {
      const response = await fetch(`http://${this.esp32IP}:8080/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        return { success: true, message: 'Connected to G5 printer' };
      } else {
        throw new Error(result.error || 'Unknown error connecting to G5');
      }
    } catch (error) {
      console.error('Failed to connect to G5:', error);
      throw new Error(`Failed to connect to G5 printer: ${(error as Error).message}`);
    }
  }

  async printCustomerLabel(orderData: OrderData): Promise<PrintResult> {
    if (!this.esp32IP) {
      throw new Error('ESP32 IP not set. Call connect() first.');
    }

    const { orderId, customerName, customerPhone, address, quantity = 1 } = orderData;

    const printData = {
      orderId: orderId || 'N/A',
      customerName: customerName || 'N/A',
      customerPhone: customerPhone || 'N/A',
      address: address || 'N/A',
      quantity: parseInt(String(quantity)) || 1,
    };

    try {
      console.log('Sending print request to ESP32:', printData);

      const response = await fetch(`http://${this.esp32IP}:8080/print-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(printData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        return {
          success: true,
          message: `Successfully printed ${quantity} label(s)`,
          quantity: quantity,
        };
      } else {
        throw new Error(result.error || 'Unknown print error');
      }
    } catch (error) {
      console.error('Failed to print label:', error);
      throw new Error(`Print failed: ${(error as Error).message}`);
    }
  }

  disconnect(): void {
    this.esp32IP = null;
    this.isConnected = false;
    this.autoDiscovered = false;
  }

  getConnectionInfo(): { esp32IP: string | null; isConnected: boolean; autoDiscovered: boolean } {
    return {
      esp32IP: this.esp32IP,
      isConnected: this.isConnected,
      autoDiscovered: this.autoDiscovered,
    };
  }
}

export default ESP32PrinterService;
export const esp32PrinterService = new ESP32PrinterService();
