import TcpSocket from 'react-native-tcp-socket';

// ESC/POS commands for thermal printer
const ESC = {
  INIT: '\x1B\x40',
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  CENTER: '\x1B\x61\x01',
  LEFT: '\x1B\x61\x00',
  RIGHT: '\x1B\x61\x02',
  DOUBLE_HEIGHT: '\x1B\x21\x10',
  DOUBLE_WIDTH: '\x1B\x21\x20',
  DOUBLE_SIZE: '\x1B\x21\x30',
  NORMAL: '\x1B\x21\x00',
  UNDERLINE_ON: '\x1B\x2D\x01',
  UNDERLINE_OFF: '\x1B\x2D\x00',
  FEED: '\n',
  CUT: '\x1D\x56\x41\x03',
};

interface PrintResult {
  success: boolean;
  error?: string;
}

class LocalPrinterService {
  private defaultPort = 9100;
  private timeout = 10000; // 10 second timeout

  /**
   * Check if TCP socket is available (development build vs Expo Go)
   */
  isAvailable(): boolean {
    return true;
  }

  /**
   * Send raw ESC/POS content directly to printer via TCP
   */
  async printRaw(
    printerIp: string,
    content: string,
    port: number = this.defaultPort
  ): Promise<PrintResult> {
    return new Promise((resolve) => {
      let resolved = false;

      const client = TcpSocket.createConnection(
        {
          host: printerIp,
          port: port,
        },
        () => {
          // Connected - send the content
          console.log(`Connected to printer at ${printerIp}:${port}`);

          // Add init command only - content already has cut command
          const fullContent = ESC.INIT + content;

          client.write(fullContent, 'utf8', () => {
            console.log('Print data sent successfully');
            // Give printer time to process
            setTimeout(() => {
              client.destroy();
              if (!resolved) {
                resolved = true;
                resolve({ success: true });
              }
            }, 500);
          });
        }
      );

      client.on('error', (error: any) => {
        console.error('Printer connection error:', error.message);
        client.destroy();
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: error.message });
        }
      });

      client.on('timeout', () => {
        console.error('Printer connection timeout');
        client.destroy();
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: 'Connection timeout' });
        }
      });

      client.on('close', () => {
        console.log('Printer connection closed');
        if (!resolved) {
          resolved = true;
          resolve({ success: true });
        }
      });

      // Fallback timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          client.destroy();
          resolve({ success: false, error: 'Print operation timeout' });
        }
      }, this.timeout + 2000);
    });
  }

  /**
   * Print pre-formatted receipt content
   * This accepts the same format as the cloud API
   */
  async printReceipt(
    printerIp: string,
    content: string,
    port: number = this.defaultPort
  ): Promise<PrintResult> {
    if (!printerIp) {
      return { success: false, error: 'Printer IP not configured' };
    }

    console.log(`Printing to local printer: ${printerIp}:${port}`);
    return this.printRaw(printerIp, content, port);
  }

  /**
   * Test print to verify connection
   */
  async testPrint(printerIp: string, port: number = this.defaultPort): Promise<PrintResult> {
    const testContent = [
      ESC.CENTER + ESC.DOUBLE_SIZE,
      'PRINT TEST',
      ESC.NORMAL,
      '',
      ESC.LEFT,
      'Local network print working!',
      `Printer: ${printerIp}:${port}`,
      '',
      `Time: ${new Date().toLocaleString()}`,
      '',
      ESC.CENTER,
      'Connection successful!',
      '',
    ].join('\n');

    return this.printRaw(printerIp, testContent, port);
  }
}

export const localPrinter = new LocalPrinterService();
export default localPrinter;
