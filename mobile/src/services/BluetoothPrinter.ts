import { BleManager, Device, State } from 'react-native-ble-plx';
import { Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Base64 encoding helper for React Native
function stringToBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;

  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;

    const n = (a << 16) | (b << 8) | c;

    result += chars[(n >> 18) & 63];
    result += chars[(n >> 12) & 63];
    result += i - 2 < str.length ? chars[(n >> 6) & 63] : '=';
    result += i - 1 < str.length ? chars[n & 63] : '=';
  }

  return result;
}

const PRINTER_STORAGE_KEY = 'connected_printer';

// Common thermal printer service UUIDs
const PRINTER_SERVICE_UUIDS = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Generic printer service
  '000018f0-0000-1000-8000-00805f9b34fb', // Star Micronics
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Some ESC/POS printers
];

const PRINTER_CHARACTERISTIC_UUIDS = [
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // Generic write characteristic
  '00002af1-0000-1000-8000-00805f9b34fb', // Star Micronics
];

class BluetoothPrinterService {
  private manager: BleManager;
  private connectedDevice: Device | null = null;
  private writeCharacteristicUUID: string | null = null;
  private serviceUUID: string | null = null;
  private isScanning: boolean = false;
  private onDevicesUpdate: ((devices: Device[]) => void) | null = null;
  private discoveredDevices: Map<string, Device> = new Map();

  constructor() {
    this.manager = new BleManager();
  }

  async initialize(): Promise<boolean> {
    return new Promise((resolve) => {
      this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          resolve(true);
        } else if (state === State.PoweredOff) {
          Alert.alert('Bluetooth Off', 'Please turn on Bluetooth to use the printer');
          resolve(false);
        }
      }, true);
    });
  }

  async startScan(onDevicesUpdate: (devices: Device[]) => void): Promise<void> {
    if (this.isScanning) return;

    const isReady = await this.initialize();
    if (!isReady) return;

    this.isScanning = true;
    this.discoveredDevices.clear();
    this.onDevicesUpdate = onDevicesUpdate;

    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        console.error('Scan error:', error);
        this.stopScan();
        return;
      }

      if (device && device.name) {
        this.discoveredDevices.set(device.id, device);
        if (this.onDevicesUpdate) {
          this.onDevicesUpdate(Array.from(this.discoveredDevices.values()));
        }
      }
    });

    // Auto-stop after 10 seconds
    setTimeout(() => {
      this.stopScan();
    }, 10000);
  }

  stopScan(): void {
    if (this.isScanning) {
      this.manager.stopDeviceScan();
      this.isScanning = false;
    }
  }

  async connect(device: Device): Promise<boolean> {
    try {
      this.stopScan();

      const connectedDevice = await device.connect();
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // Find the write characteristic
      const services = await connectedDevice.services();

      for (const service of services) {
        const characteristics = await service.characteristics();
        for (const char of characteristics) {
          if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
            this.serviceUUID = service.uuid;
            this.writeCharacteristicUUID = char.uuid;
            break;
          }
        }
        if (this.writeCharacteristicUUID) break;
      }

      if (!this.writeCharacteristicUUID) {
        await connectedDevice.cancelConnection();
        throw new Error('No writable characteristic found');
      }

      this.connectedDevice = connectedDevice;

      // Save connected printer info
      await SecureStore.setItemAsync(PRINTER_STORAGE_KEY, JSON.stringify({
        id: device.id,
        name: device.name,
      }));

      // Set up disconnect listener
      this.manager.onDeviceDisconnected(device.id, () => {
        this.connectedDevice = null;
        this.writeCharacteristicUUID = null;
        this.serviceUUID = null;
      });

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
      this.connectedDevice = null;
      this.writeCharacteristicUUID = null;
      this.serviceUUID = null;
      await SecureStore.deleteItemAsync(PRINTER_STORAGE_KEY);
    }
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getConnectedDeviceName(): string | null {
    return this.connectedDevice?.name || null;
  }

  async getSavedPrinter(): Promise<{ id: string; name: string } | null> {
    try {
      const saved = await SecureStore.getItemAsync(PRINTER_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  async reconnectSavedPrinter(): Promise<boolean> {
    const saved = await this.getSavedPrinter();
    if (!saved) return false;

    try {
      const devices = await this.manager.connectedDevices([]);
      const device = devices.find(d => d.id === saved.id);

      if (device) {
        return await this.connect(device);
      }

      // Try to connect directly
      const targetDevice = await this.manager.connectToDevice(saved.id);
      if (targetDevice) {
        await targetDevice.discoverAllServicesAndCharacteristics();

        const services = await targetDevice.services();
        for (const service of services) {
          const characteristics = await service.characteristics();
          for (const char of characteristics) {
            if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
              this.serviceUUID = service.uuid;
              this.writeCharacteristicUUID = char.uuid;
              break;
            }
          }
          if (this.writeCharacteristicUUID) break;
        }

        if (this.writeCharacteristicUUID) {
          this.connectedDevice = targetDevice;
          return true;
        }
      }
    } catch (error) {
      console.error('Reconnect error:', error);
    }
    return false;
  }

  // ESC/POS commands for thermal printers
  private createESCPOSCommands() {
    return {
      INIT: '\x1B\x40', // Initialize printer
      CUT: '\x1D\x56\x00', // Full cut
      PARTIAL_CUT: '\x1D\x56\x01', // Partial cut
      ALIGN_CENTER: '\x1B\x61\x01',
      ALIGN_LEFT: '\x1B\x61\x00',
      ALIGN_RIGHT: '\x1B\x61\x02',
      BOLD_ON: '\x1B\x45\x01',
      BOLD_OFF: '\x1B\x45\x00',
      DOUBLE_HEIGHT: '\x1B\x21\x10',
      DOUBLE_WIDTH: '\x1B\x21\x20',
      DOUBLE_SIZE: '\x1B\x21\x30',
      NORMAL_SIZE: '\x1B\x21\x00',
      FEED_LINES: (n: number) => `\x1B\x64${String.fromCharCode(n)}`,
      BARCODE_HEIGHT: (h: number) => `\x1D\x68${String.fromCharCode(h)}`,
      BARCODE_WIDTH: (w: number) => `\x1D\x77${String.fromCharCode(w)}`,
      BARCODE_CODE39: '\x1D\x6B\x04', // CODE39 barcode
    };
  }

  async printText(text: string): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      Alert.alert('Printer Not Connected', 'Please connect to a printer first');
      return false;
    }

    try {
      const ESC = this.createESCPOSCommands();
      const data = ESC.INIT + text + ESC.FEED_LINES(3) + ESC.CUT;

      // Convert to base64
      const base64Data = stringToBase64(data);

      await this.connectedDevice.writeCharacteristicWithResponseForService(
        this.serviceUUID,
        this.writeCharacteristicUUID,
        base64Data
      );

      return true;
    } catch (error) {
      console.error('Print error:', error);
      return false;
    }
  }

  async printOrderTag(order: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    weight?: number;
    bagNumber?: number;
    totalBags?: number;
    isSameDay?: boolean;
  }): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      Alert.alert('Printer Not Connected', 'Please connect to a printer first');
      return false;
    }

    try {
      const ESC = this.createESCPOSCommands();
      const date = new Date().toLocaleDateString();
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let label = ESC.INIT;
      label += ESC.ALIGN_CENTER;
      label += ESC.BOLD_ON + ESC.DOUBLE_SIZE;
      label += `LAUNDROMAT\n`;
      label += ESC.NORMAL_SIZE + ESC.BOLD_OFF;
      label += `${date} ${time}\n\n`;

      label += ESC.DOUBLE_SIZE + ESC.BOLD_ON;
      label += `#${order.orderId}\n`;
      label += ESC.NORMAL_SIZE + ESC.BOLD_OFF;

      if (order.bagNumber && order.totalBags) {
        label += ESC.DOUBLE_HEIGHT;
        label += `BAG ${order.bagNumber}/${order.totalBags}\n`;
        label += ESC.NORMAL_SIZE;
      }

      label += '\n';
      label += ESC.ALIGN_LEFT;
      label += ESC.BOLD_ON + `Customer: ` + ESC.BOLD_OFF + `${order.customerName}\n`;
      label += ESC.BOLD_ON + `Phone: ` + ESC.BOLD_OFF + `${order.customerPhone}\n`;

      if (order.weight) {
        label += ESC.BOLD_ON + `Weight: ` + ESC.BOLD_OFF + `${order.weight} lbs\n`;
      }

      if (order.isSameDay) {
        label += '\n';
        label += ESC.ALIGN_CENTER + ESC.DOUBLE_SIZE + ESC.BOLD_ON;
        label += `** SAME DAY **\n`;
        label += ESC.NORMAL_SIZE + ESC.BOLD_OFF;
      }

      label += '\n';
      label += ESC.ALIGN_CENTER;
      label += '--------------------------------\n';
      label += ESC.FEED_LINES(2);
      label += ESC.CUT;

      // Convert to base64
      const base64Data = stringToBase64(label);

      await this.connectedDevice.writeCharacteristicWithResponseForService(
        this.serviceUUID,
        this.writeCharacteristicUUID,
        base64Data
      );

      return true;
    } catch (error) {
      console.error('Print tag error:', error);
      return false;
    }
  }

  async printPickupSheet(orders: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    address?: string;
  }[]): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      Alert.alert('Printer Not Connected', 'Please connect to a printer first');
      return false;
    }

    try {
      const ESC = this.createESCPOSCommands();
      const date = new Date().toLocaleDateString();

      let sheet = ESC.INIT;
      sheet += ESC.ALIGN_CENTER;
      sheet += ESC.BOLD_ON + ESC.DOUBLE_SIZE;
      sheet += `PICKUP SHEET\n`;
      sheet += ESC.NORMAL_SIZE + ESC.BOLD_OFF;
      sheet += `${date}\n`;
      sheet += '================================\n\n';

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        sheet += ESC.ALIGN_LEFT;
        sheet += ESC.BOLD_ON + `${i + 1}. #${order.orderId}\n` + ESC.BOLD_OFF;
        sheet += `   ${order.customerName}\n`;
        sheet += `   ${order.customerPhone}\n`;
        if (order.address) {
          sheet += `   ${order.address}\n`;
        }
        sheet += '\n';
      }

      sheet += ESC.ALIGN_CENTER;
      sheet += '================================\n';
      sheet += `Total: ${orders.length} pickups\n`;
      sheet += ESC.FEED_LINES(3);
      sheet += ESC.CUT;

      const base64Data = stringToBase64(sheet);

      await this.connectedDevice.writeCharacteristicWithResponseForService(
        this.serviceUUID,
        this.writeCharacteristicUUID,
        base64Data
      );

      return true;
    } catch (error) {
      console.error('Print pickup sheet error:', error);
      return false;
    }
  }

  destroy(): void {
    this.stopScan();
    this.manager.destroy();
  }
}

// Singleton instance
export const bluetoothPrinter = new BluetoothPrinterService();
