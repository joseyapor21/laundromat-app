import { BleManager, Device, State } from 'react-native-ble-plx';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;

    const n = (a << 16) | (b << 8) | c;

    result += chars[(n >> 18) & 63];
    result += chars[(n >> 12) & 63];
    result += i + 1 < len ? chars[(n >> 6) & 63] : '=';
    result += i + 2 < len ? chars[n & 63] : '=';
  }

  return result;
}

const PRINTER_STORAGE_KEY = 'connected_printer';

// Bitmap font data for characters (8x8 pixels each)
const BITMAP_FONT: { [key: string]: number[] } = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  'A': [0x18, 0x3C, 0x66, 0x66, 0x7E, 0x66, 0x66, 0x00],
  'B': [0x7C, 0x66, 0x66, 0x7C, 0x66, 0x66, 0x7C, 0x00],
  'C': [0x3C, 0x66, 0x60, 0x60, 0x60, 0x66, 0x3C, 0x00],
  'D': [0x78, 0x6C, 0x66, 0x66, 0x66, 0x6C, 0x78, 0x00],
  'E': [0x7E, 0x60, 0x60, 0x7C, 0x60, 0x60, 0x7E, 0x00],
  'F': [0x7E, 0x60, 0x60, 0x7C, 0x60, 0x60, 0x60, 0x00],
  'G': [0x3C, 0x66, 0x60, 0x6E, 0x66, 0x66, 0x3C, 0x00],
  'H': [0x66, 0x66, 0x66, 0x7E, 0x66, 0x66, 0x66, 0x00],
  'I': [0x3C, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3C, 0x00],
  'J': [0x1E, 0x0C, 0x0C, 0x0C, 0x0C, 0x6C, 0x38, 0x00],
  'K': [0x66, 0x6C, 0x78, 0x70, 0x78, 0x6C, 0x66, 0x00],
  'L': [0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x7E, 0x00],
  'M': [0x63, 0x77, 0x7F, 0x6B, 0x63, 0x63, 0x63, 0x00],
  'N': [0x66, 0x76, 0x7E, 0x7E, 0x6E, 0x66, 0x66, 0x00],
  'O': [0x3C, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00],
  'P': [0x7C, 0x66, 0x66, 0x7C, 0x60, 0x60, 0x60, 0x00],
  'Q': [0x3C, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x0E, 0x00],
  'R': [0x7C, 0x66, 0x66, 0x7C, 0x78, 0x6C, 0x66, 0x00],
  'S': [0x3C, 0x66, 0x60, 0x3C, 0x06, 0x66, 0x3C, 0x00],
  'T': [0x7E, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x00],
  'U': [0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00],
  'V': [0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x18, 0x00],
  'W': [0x63, 0x63, 0x63, 0x6B, 0x7F, 0x77, 0x63, 0x00],
  'X': [0x66, 0x66, 0x3C, 0x18, 0x3C, 0x66, 0x66, 0x00],
  'Y': [0x66, 0x66, 0x66, 0x3C, 0x18, 0x18, 0x18, 0x00],
  'Z': [0x7E, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x7E, 0x00],
  '0': [0x3C, 0x66, 0x6E, 0x76, 0x66, 0x66, 0x3C, 0x00],
  '1': [0x18, 0x18, 0x38, 0x18, 0x18, 0x18, 0x7E, 0x00],
  '2': [0x3C, 0x66, 0x06, 0x0C, 0x30, 0x60, 0x7E, 0x00],
  '3': [0x3C, 0x66, 0x06, 0x1C, 0x06, 0x66, 0x3C, 0x00],
  '4': [0x06, 0x0E, 0x1E, 0x66, 0x7F, 0x06, 0x06, 0x00],
  '5': [0x7E, 0x60, 0x7C, 0x06, 0x06, 0x66, 0x3C, 0x00],
  '6': [0x3C, 0x66, 0x60, 0x7C, 0x66, 0x66, 0x3C, 0x00],
  '7': [0x7E, 0x66, 0x0C, 0x18, 0x18, 0x18, 0x18, 0x00],
  '8': [0x3C, 0x66, 0x66, 0x3C, 0x66, 0x66, 0x3C, 0x00],
  '9': [0x3C, 0x66, 0x66, 0x3E, 0x06, 0x66, 0x3C, 0x00],
  ':': [0x00, 0x00, 0x18, 0x00, 0x00, 0x18, 0x00, 0x00],
  '#': [0x36, 0x36, 0x7F, 0x36, 0x7F, 0x36, 0x36, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x30, 0x00],
  '-': [0x00, 0x00, 0x00, 0x7E, 0x00, 0x00, 0x00, 0x00],
  '/': [0x00, 0x03, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x00],
  '(': [0x0C, 0x18, 0x30, 0x30, 0x30, 0x18, 0x0C, 0x00],
  ')': [0x30, 0x18, 0x0C, 0x0C, 0x0C, 0x18, 0x30, 0x00],
  '*': [0x00, 0x66, 0x3C, 0xFF, 0x3C, 0x66, 0x00, 0x00],
  '=': [0x00, 0x00, 0x7E, 0x00, 0x7E, 0x00, 0x00, 0x00],
  '!': [0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00],
  '?': [0x3C, 0x66, 0x06, 0x0C, 0x18, 0x00, 0x18, 0x00],
  '$': [0x18, 0x3E, 0x60, 0x3C, 0x06, 0x7C, 0x18, 0x00],
  '@': [0x3E, 0x63, 0x7B, 0x7B, 0x7B, 0x03, 0x1E, 0x00],
};

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

  // Send raw bytes to printer
  private async sendRawData(data: Uint8Array): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      return false;
    }

    try {
      // Send in chunks for reliability
      const chunkSize = 100;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const base64Data = uint8ArrayToBase64(chunk);

        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          this.serviceUUID,
          this.writeCharacteristicUUID,
          base64Data
        );

        // Small delay between chunks
        if (i + chunkSize < data.length) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
      return true;
    } catch (error) {
      console.error('Send raw data error:', error);
      return false;
    }
  }

  // Print text as bitmap (for Netum G5 and similar printers)
  private async printBitmapText(text: string, scaleFactor: number = 2): Promise<boolean> {
    const cleanText = text.replace(/\n/g, '').toUpperCase();
    if (cleanText.length === 0) return true;

    const charCount = cleanText.length;
    const charWidthDots = 8;
    const charHeightDots = 8;
    const scaledCharWidth = charWidthDots * scaleFactor;
    const labelWidthBytes = 48; // Fixed width for 57mm labels

    // Build bitmap line by line
    for (let row = 0; row < charHeightDots; row++) {
      for (let scaleY = 0; scaleY < scaleFactor; scaleY++) {
        const rowData = new Array(labelWidthBytes).fill(0);
        const labelWidthDots = labelWidthBytes * 8;
        const textWidthDots = charCount * scaledCharWidth;
        const textStartBit = Math.floor((labelWidthDots - textWidthDots) / 2);
        let bitPosition = textStartBit;

        for (let charIndex = 0; charIndex < charCount; charIndex++) {
          const char = cleanText[charIndex];
          const bitmap = BITMAP_FONT[char] || BITMAP_FONT[' '];
          const charRowByte = bitmap[row] || 0x00;

          for (let bit = 7; bit >= 0; bit--) {
            const bitValue = (charRowByte >> bit) & 1;
            for (let scaleX = 0; scaleX < scaleFactor; scaleX++) {
              if (bitPosition >= 0 && bitPosition < labelWidthDots) {
                const byteIndex = Math.floor(bitPosition / 8);
                const bitIndex = 7 - (bitPosition % 8);
                if (bitValue) {
                  rowData[byteIndex] |= (1 << bitIndex);
                }
              }
              bitPosition++;
            }
          }
        }

        // Send this row using DothanTech command format
        const command = new Uint8Array([0x1F, 0x2B, 0, rowData.length, ...rowData]);
        await this.sendRawData(command);
      }
    }

    // Add line spacing after text
    await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x04]));
    return true;
  }

  async printOrderTag(order: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    address?: string;
    weight?: number;
    bagNumber?: number;
    totalBags?: number;
    isSameDay?: boolean;
    orderType?: string;
  }): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      Alert.alert('Printer Not Connected', 'Please connect to a printer first');
      return false;
    }

    try {
      const date = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Initialize printer with thermal settings
      await this.sendRawData(new Uint8Array([0x1B, 0x40])); // Reset
      await this.sendRawData(new Uint8Array([0x1B, 0x37, 0x07, 0x64, 0x64])); // Heat settings
      await this.sendRawData(new Uint8Array([0x1B, 0x38, 0x07, 0x64, 0x64])); // Density settings

      // Top margin
      await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x18]));

      // Print order info as bitmaps
      await this.printBitmapText(`ORDER: ${order.orderId}`, 3);
      await new Promise(resolve => setTimeout(resolve, 500));

      await this.printBitmapText(order.customerName, 3);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Print address if available
      if (order.address) {
        await this.printBitmapText('ADDRESS:', 2);
        await new Promise(resolve => setTimeout(resolve, 200));
        // Split long addresses into multiple lines (max ~20 chars per line)
        const addr = order.address.toUpperCase();
        const maxLineLength = 20;
        if (addr.length > maxLineLength) {
          // Split at spaces or commas
          const words = addr.split(/[\s,]+/);
          let currentLine = '';
          for (const word of words) {
            if (currentLine.length + word.length + 1 <= maxLineLength) {
              currentLine += (currentLine ? ' ' : '') + word;
            } else {
              if (currentLine) {
                await this.printBitmapText(currentLine, 2);
                await new Promise(resolve => setTimeout(resolve, 200));
              }
              currentLine = word;
            }
          }
          if (currentLine) {
            await this.printBitmapText(currentLine, 2);
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } else {
          await this.printBitmapText(addr, 2);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      await this.printBitmapText(`DATE: ${date} ${time}`, 2);
      await new Promise(resolve => setTimeout(resolve, 300));

      if (order.bagNumber && order.totalBags) {
        await this.printBitmapText(`BAG ${order.bagNumber} OF ${order.totalBags}`, 3);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (order.isSameDay) {
        await this.printBitmapText('** SAME DAY **', 3);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Footer line
      await this.printBitmapText('========================', 1);

      // Feed and advance to next label
      await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x06]));
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.sendRawData(new Uint8Array([0x0C])); // Form feed

      return true;
    } catch (error) {
      console.error('Print tag error:', error);
      return false;
    }
  }

  // Print multiple bag labels for an order
  async printMultipleBagLabels(order: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    address?: string;
    weight?: number;
    isSameDay?: boolean;
    orderType?: string;
  }, totalBags: number): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      Alert.alert('Printer Not Connected', 'Please connect to a printer first');
      return false;
    }

    try {
      for (let bagNumber = 1; bagNumber <= totalBags; bagNumber++) {
        const success = await this.printOrderTag({
          ...order,
          bagNumber,
          totalBags,
        });

        if (!success) {
          Alert.alert('Print Error', `Failed to print bag ${bagNumber} of ${totalBags}`);
          return false;
        }

        // Small delay between labels
        if (bagNumber < totalBags) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return true;
    } catch (error) {
      console.error('Print multiple bags error:', error);
      return false;
    }
  }

  async printPickupSheet(orders: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    address?: string;
    orderType?: string;
  }[]): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      Alert.alert('Printer Not Connected', 'Please connect to a printer first');
      return false;
    }

    try {
      const date = new Date().toLocaleDateString();

      // Initialize printer
      await this.sendRawData(new Uint8Array([0x1B, 0x40]));
      await this.sendRawData(new Uint8Array([0x1B, 0x37, 0x07, 0x64, 0x64]));
      await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x18]));

      // Header
      await this.printBitmapText('PICKUP SHEET', 3);
      await this.printBitmapText(date, 2);
      await this.printBitmapText('========================', 1);

      // Orders
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        await this.printBitmapText(`${i + 1}. ${order.orderId}`, 2);
        await this.printBitmapText(order.customerName, 2);
        if (order.address) {
          // Split long addresses
          const addr = order.address.toUpperCase();
          if (addr.length > 20) {
            await this.printBitmapText(addr.substring(0, 20), 1);
            await this.printBitmapText(addr.substring(20), 1);
          } else {
            await this.printBitmapText(addr, 1);
          }
        }
        await this.printBitmapText('', 1); // Spacing
      }

      await this.printBitmapText('========================', 1);
      await this.printBitmapText(`TOTAL: ${orders.length} PICKUPS`, 2);

      // Feed paper
      await this.sendRawData(new Uint8Array([0x1B, 0x64, 0x05]));
      await this.sendRawData(new Uint8Array([0x0C]));

      return true;
    } catch (error) {
      console.error('Print pickup sheet error:', error);
      return false;
    }
  }

  // Test print to verify connection
  async printTest(): Promise<boolean> {
    if (!this.connectedDevice || !this.writeCharacteristicUUID || !this.serviceUUID) {
      Alert.alert('Printer Not Connected', 'Please connect to a printer first');
      return false;
    }

    try {
      // Initialize
      await this.sendRawData(new Uint8Array([0x1B, 0x40]));
      await this.sendRawData(new Uint8Array([0x1B, 0x37, 0x07, 0x64, 0x64]));
      await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x18]));

      // Test content
      await this.printBitmapText('PRINTER TEST', 3);
      await this.printBitmapText('LAUNDROMAT APP', 2);
      await this.printBitmapText('CONNECTION OK', 2);
      await this.printBitmapText('========================', 1);

      // Feed
      await this.sendRawData(new Uint8Array([0x1B, 0x64, 0x03]));
      await this.sendRawData(new Uint8Array([0x0C]));

      return true;
    } catch (error) {
      console.error('Test print error:', error);
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
