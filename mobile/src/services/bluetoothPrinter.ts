// Bluetooth Thermal Printer Service for React Native
// Supports Netum G5 and similar ESC/POS Bluetooth printers
// Uses bitmap printing like the web version

import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';

// BLE Manager instance
let bleManager: any = null;
let bleInitialized = false;
let bleError: string | null = null;

interface PrinterDevice {
  id: string;
  name: string;
}

interface OrderData {
  orderId?: string | number;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  weight?: number;
  notes?: string;
  _id?: string;
}

// Bitmap font data for characters (8x8 pixels) - same as web
const BITMAP_FONT: Record<string, number[]> = {
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
  '+': [0x00, 0x18, 0x18, 0x7E, 0x18, 0x18, 0x00, 0x00],
  '=': [0x00, 0x00, 0x7E, 0x00, 0x7E, 0x00, 0x00, 0x00],
  '&': [0x1C, 0x36, 0x1C, 0x6E, 0x3B, 0x33, 0x6E, 0x00],
  '!': [0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00],
  '?': [0x3C, 0x66, 0x06, 0x0C, 0x18, 0x00, 0x18, 0x00],
  '$': [0x18, 0x3E, 0x60, 0x3C, 0x06, 0x7C, 0x18, 0x00],
  '@': [0x3E, 0x63, 0x7B, 0x7B, 0x7B, 0x03, 0x1E, 0x00],
  // Additional characters for addresses
  '*': [0x00, 0x66, 0x3C, 0xFF, 0x3C, 0x66, 0x00, 0x00],
  '%': [0x63, 0x63, 0x06, 0x0C, 0x18, 0x63, 0x63, 0x00],
  ';': [0x00, 0x00, 0x18, 0x00, 0x18, 0x18, 0x30, 0x00],
  "'": [0x06, 0x0C, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00],
  '"': [0x66, 0x66, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00],
  '[': [0x3C, 0x30, 0x30, 0x30, 0x30, 0x30, 0x3C, 0x00],
  ']': [0x3C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x3C, 0x00],
  '_': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7F, 0x00],
  '\\': [0x00, 0x60, 0x30, 0x18, 0x0C, 0x06, 0x03, 0x00],
};

class BluetoothPrinterService {
  private device: PrinterDevice | null = null;
  private isConnected: boolean = false;
  private characteristic: any = null;
  private manager: any = null;
  private bleDevice: any = null;

  constructor() {
    // Don't auto-init - wait for explicit connect
  }

  private initBleManager(): boolean {
    if (bleInitialized) {
      return bleManager !== null;
    }

    bleInitialized = true;

    try {
      const { BleManager } = require('react-native-ble-plx');
      bleManager = new BleManager();
      this.manager = bleManager;
      console.log('BLE Manager initialized');
      return true;
    } catch (error) {
      console.log('BLE library not available - Bluetooth printing requires a development build');
      bleError = 'Bluetooth printing requires a development build. Install react-native-ble-plx and run: npx expo prebuild';
      return false;
    }
  }

  isBluetoothSupported(): boolean {
    return this.initBleManager();
  }

  getInitError(): string | null {
    return bleError;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const { PermissionsAndroid } = require('react-native');
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(granted).every(
          (permission) => permission === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (error) {
        console.error('Permission request error:', error);
        return false;
      }
    }
    return true;
  }

  async connect(): Promise<{ success: boolean; message: string }> {
    if (!this.initBleManager() || !this.manager) {
      throw new Error(bleError || 'Bluetooth not available. Please use a development build with BLE support.');
    }

    try {
      const hasPermissions = await this.requestPermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth permissions not granted');
      }

      console.log('Scanning for printers...');

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.manager.stopDeviceScan();
          reject(new Error('No printer found. Make sure your printer is on and in range.'));
        }, 15000);

        this.manager.startDeviceScan(
          null,
          { allowDuplicates: false },
          async (error: any, device: any) => {
            if (error) {
              clearTimeout(timeout);
              this.manager.stopDeviceScan();
              reject(new Error(`Scan error: ${error.message}`));
              return;
            }

            if (device && device.name && (
              device.name.includes('G5') ||
              device.name.includes('Netum') ||
              device.name.includes('Printer') ||
              device.name.includes('POS') ||
              device.name.includes('Thermal')
            )) {
              clearTimeout(timeout);
              this.manager.stopDeviceScan();

              console.log('Found printer:', device.name);

              try {
                const connectedDevice = await device.connect();
                console.log('Connected to device');

                await connectedDevice.discoverAllServicesAndCharacteristics();
                console.log('Discovered services');

                const services = await connectedDevice.services();
                for (const service of services) {
                  const characteristics = await service.characteristics();
                  for (const char of characteristics) {
                    if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
                      this.characteristic = char;
                      this.device = { id: device.id, name: device.name };
                      this.bleDevice = connectedDevice;
                      this.isConnected = true;

                      // Initialize printer
                      await this.sendRawBytes([0x1B, 0x40]); // ESC @ reset

                      console.log('Printer ready:', device.name);
                      resolve({ success: true, message: `Connected to ${device.name}` });
                      return;
                    }
                  }
                }

                reject(new Error('No writable characteristic found on printer'));
              } catch (connectError: any) {
                reject(new Error(`Connection failed: ${connectError.message}`));
              }
            }
          }
        );
      });
    } catch (error: any) {
      console.error('Connect error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.bleDevice) {
      try {
        await this.bleDevice.cancelConnection();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
    this.device = null;
    this.characteristic = null;
    this.bleDevice = null;
    this.isConnected = false;
    console.log('Disconnected from printer');
  }

  // Send raw bytes to printer with chunked transmission (like web version)
  async sendRawBytes(bytes: number[]): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Printer not connected');
    }

    try {
      const data = new Uint8Array(bytes);

      // Use chunked transmission like web version for reliability
      const chunkSize = 100; // Match web's chunk size

      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
        const base64 = this.uint8ArrayToBase64(chunk);

        if (this.characteristic.isWritableWithoutResponse) {
          await this.characteristic.writeWithoutResponse(base64);
        } else {
          await this.characteristic.writeWithResponse(base64);
        }

        // Small delay between chunks for reliability (like web version)
        if (i + chunkSize < data.length) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
    } catch (error: any) {
      console.error('Send error:', error);
      throw error;
    }
  }

  // Convert Uint8Array to base64 for react-native-ble-plx
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Print bitmap text line using DothanTech commands (like the web version)
  async printBitmapText(text: string, scaleFactor: number = 2): Promise<void> {
    const cleanText = text.replace(/\n/g, '').toUpperCase();

    if (cleanText.length === 0) {
      // Just add spacing
      await this.sendRawBytes([0x1B, 0x4A, 0x04]);
      return;
    }

    console.log(`Printing bitmap: "${cleanText}" at ${scaleFactor}x scale`);

    const charWidthDots = 8;
    const charHeightDots = 8;
    const scaledCharWidth = charWidthDots * scaleFactor;
    const labelWidthBytes = 48; // Fixed width for 57mm labels
    const textWidthDots = cleanText.length * scaledCharWidth;
    const labelWidthDots = labelWidthBytes * 8;
    const textStartBit = Math.floor((labelWidthDots - textWidthDots) / 2);

    // Build bitmap row by row
    for (let row = 0; row < charHeightDots; row++) {
      for (let scaleY = 0; scaleY < scaleFactor; scaleY++) {
        const rowData = new Array(labelWidthBytes).fill(0);
        let bitPosition = textStartBit;

        for (let charIndex = 0; charIndex < cleanText.length; charIndex++) {
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

        // Send row using DothanTech command: 0x1F 0x2B leadingBlanks dataLength data...
        const command = [0x1F, 0x2B, 0, rowData.length, ...rowData];
        await this.sendRawBytes(command);
      }
    }

    // Add line spacing after text
    await this.sendRawBytes([0x1B, 0x4A, 0x04]);
  }

  // Print customer label using bitmap (like the web version)
  async printCustomerLabel(order: OrderData, quantity: number = 1): Promise<{ success: boolean; message: string }> {
    if (!this.isConnected) {
      throw new Error('Printer not connected');
    }

    try {
      console.log(`Printing ${quantity} label(s)...`);

      let orderId = order.orderId?.toString() || order._id?.slice(-6) || 'N/A';
      if (orderId.startsWith('ORD')) {
        orderId = orderId.substring(3).trim();
      }

      const customerName = (order.customerName || 'N/A').toUpperCase();
      const phoneNumber = order.customerPhone || 'N/A';
      const now = new Date();
      const pickupDate = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
      const pickupTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const address = (order.address || 'NOT SPECIFIED').toUpperCase();
      const notes = order.notes || '';

      for (let i = 1; i <= quantity; i++) {
        console.log(`Printing label ${i} of ${quantity}...`);

        // Initialize printer (matching web version settings)
        await this.sendRawBytes([0x1B, 0x40]); // Reset
        await this.sendRawBytes([0x1B, 0x37, 0x07, 0x64, 0x64]); // Heat settings
        await this.sendRawBytes([0x1B, 0x38, 0x07, 0x64, 0x64]); // Density settings (from web)
        await new Promise(resolve => setTimeout(resolve, 200));

        // Top margin
        await this.sendRawBytes([0x1B, 0x4A, 0x18]);

        // Print ORDER (use longer delay for large text like web version)
        await this.printBitmapText(`ORDER: ${orderId}`, 3);
        console.log('ORDER SENT - Waiting 1000ms for large text processing...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Print CUSTOMER NAME (use longer delay for large text like web version)
        await this.printBitmapText(customerName, 3);
        console.log('NAME SENT - Waiting 1000ms for large text processing...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Print PHONE
        await this.printBitmapText(`PHONE: ${phoneNumber}`, 2);
        console.log('PHONE SENT - Waiting for processing...');
        await new Promise(resolve => setTimeout(resolve, 800));

        // Print PICKUP DATE/TIME
        await this.printBitmapText(`PICKUP: ${pickupDate} ${pickupTime}`, 2);
        await new Promise(resolve => setTimeout(resolve, 800));

        // Print BAG number if multiple (use longer delay for large text)
        if (quantity > 1) {
          await this.printBitmapText(`BAG ${i} OF ${quantity}`, 3);
          console.log('BAG INFO SENT - Waiting 1000ms for large text processing...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Print ADDRESS
        await this.printBitmapText('ADDRESS:', 2);
        await new Promise(resolve => setTimeout(resolve, 600));

        // Split long addresses (with delays between lines like web version)
        const maxLineLength = 20;
        if (address.length > maxLineLength) {
          const words = address.split(/\s+/);
          let currentLine = '';

          for (const word of words) {
            if ((currentLine + ' ' + word).trim().length <= maxLineLength) {
              currentLine = (currentLine + ' ' + word).trim();
            } else {
              if (currentLine) {
                await this.printBitmapText(currentLine, 2);
                await new Promise(resolve => setTimeout(resolve, 300)); // Delay between address lines
              }
              currentLine = word;
            }
          }
          if (currentLine) {
            await this.printBitmapText(currentLine, 2);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } else {
          await this.printBitmapText(address, 2);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Print NOTES if any
        if (notes && notes.trim()) {
          await this.printBitmapText('NOTES:', 2);
          await new Promise(resolve => setTimeout(resolve, 200));
          await this.printBitmapText(notes.toUpperCase().substring(0, 30), 1);
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Footer separator
        await this.printBitmapText('==============================', 1);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Paper feed to next label (longer delays like web version)
        await this.sendRawBytes([0x1B, 0x4A, 0x06]);
        await new Promise(resolve => setTimeout(resolve, 300));
        await this.sendRawBytes([0x0C]); // Form feed
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log(`Label ${i} completed!`);

        if (i < quantity) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      return { success: true, message: `${quantity} label(s) printed successfully` };
    } catch (error: any) {
      console.error('Print error:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      deviceName: this.device?.name || null,
      isSupported: this.isBluetoothSupported(),
    };
  }
}

// Singleton instance
let printerInstance: BluetoothPrinterService | null = null;

function getPrinterInstance(): BluetoothPrinterService {
  if (!printerInstance) {
    printerInstance = new BluetoothPrinterService();
  }
  return printerInstance;
}

// React Hook for using Bluetooth printer
export function useBluetoothPrinter() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const printer = getPrinterInstance();

  useEffect(() => {
    const status = printer.getStatus();
    setIsConnected(status.isConnected);
    setDeviceName(status.deviceName);
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const result = await printer.connect();
      const status = printer.getStatus();
      setIsConnected(status.isConnected);
      setDeviceName(status.deviceName);
      return true;
    } catch (err: any) {
      setError(err.message);
      setIsConnected(false);

      const isNotSupported = err.message.includes('development build') || err.message.includes('not available');

      Alert.alert(
        isNotSupported ? 'Bluetooth Not Available' : 'Bluetooth Connection',
        isNotSupported
          ? 'Bluetooth printing requires a development build.\n\nTo enable:\n1. Run: npx expo install react-native-ble-plx\n2. Run: npx expo prebuild\n3. Run: npx expo run:ios'
          : err.message + '\n\nMake sure:\n1. Printer is turned on\n2. Bluetooth is enabled\n3. You are close to the printer',
        [{ text: 'OK' }]
      );

      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await printer.disconnect();
    setIsConnected(false);
    setDeviceName(null);
  }, []);

  const printLabel = useCallback(async (order: OrderData, quantity: number = 1) => {
    setError(null);
    try {
      return await printer.printCustomerLabel(order, quantity);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const isSupported = printer.isBluetoothSupported();

  return {
    isConnected,
    isConnecting,
    isSupported,
    error,
    deviceName,
    connect,
    disconnect,
    printLabel,
  };
}

export default BluetoothPrinterService;
