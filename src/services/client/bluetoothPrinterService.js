'use client';
// Bluetooth Thermal Printer Service for Netum G5
// Supports delivery driver mobile printing for customer bag labels

import { useState, useEffect } from 'react';

class BluetoothPrinterService {
    constructor() {
        this.printer = null;
        this.isConnected = false;
        this.deviceName = 'Netum G5';
        this.serviceUUID = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
        this.characteristicUUID = '49535343-8841-43f4-a8d4-ecbe34729bb3';
        
        // Canvas state (similar to LPAPI internal state)
        this.canvasWidth = 0;
        this.canvasHeight = 0;
        this.canvasOrientation = 0;
        this.currentAlignment = 0; // 0=left, 1=center, 2=right
        this.canvasCommands = [];
        this.isDrawing = false;
    }

    // Check if Web Bluetooth is supported
    isBluetoothSupported() {
        // Check for Web Bluetooth API
        if (!navigator.bluetooth) {
            console.error('Web Bluetooth is not supported in this browser');
            return false;
        }

        // Additional mobile Chrome checks
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isChrome = /Chrome/i.test(navigator.userAgent);
        
        if (isMobile) {
            console.log('Mobile device detected');
            
            // Chrome mobile has specific requirements
            if (isChrome) {
                console.log('Chrome mobile detected - checking HTTPS requirement...');
                
                // Web Bluetooth requires HTTPS on mobile
                if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                    console.error('Web Bluetooth requires HTTPS on mobile Chrome');
                    return { 
                        supported: false, 
                        error: 'HTTPS required',
                        message: 'Web Bluetooth requires HTTPS connection on mobile devices'
                    };
                }
                
                // Check if the user gesture is required
                console.log('Chrome mobile Web Bluetooth available, but requires user gesture');
                return { 
                    supported: true, 
                    requiresUserGesture: true,
                    message: 'Web Bluetooth available but requires user interaction'
                };
            }
        }
        
        console.log('Web Bluetooth supported');
        return { supported: true };
    }

    // Connect to Netum G5 thermal printer with enhanced stability
    async connect() {
        console.log('🔵 Starting connection process...');
        
        const bluetoothSupport = this.isBluetoothSupported();
        
        if (bluetoothSupport === false || (bluetoothSupport.supported === false)) {
            throw new Error(bluetoothSupport.message || 'Bluetooth not supported');
        }
        
        // Additional mobile Chrome guidance
        if (bluetoothSupport.requiresUserGesture) {
            console.log('📱 Mobile Chrome detected - ensure this is called from a user gesture (button click)');
        }

        let device;
        
        try {
            console.log('🔍 Searching for thermal printer...');
            
            // Try with filters first
            try {
                device = await navigator.bluetooth.requestDevice({
                    filters: [
                        { name: 'G5-40280365' }, // Your specific device
                        { namePrefix: 'G5-' },   // Other G5 devices
                        { name: 'Netum G5' },
                        { namePrefix: 'Netum' },
                        { namePrefix: 'NT-' },
                        { namePrefix: 'G5' },
                        { namePrefix: 'Printer' },
                        { namePrefix: 'Thermal' },
                        { namePrefix: 'POS' },
                    ],
                    optionalServices: [
                        this.serviceUUID, 
                        '000018f0-0000-1000-8000-00805f9b34fb',
                        '0000ffe0-0000-1000-8000-00805f9b34fb', // Common thermal printer service
                        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip service
                        '6e400001-b5a3-f393-e0a9-e50e24dcca9e'  // Nordic UART service
                    ]
                });
                console.log('✅ Device found with filters');
            } catch (filterError) {
                console.log('⚠️ Filter search failed, trying without filters...');
                // If filters fail, try without filters (shows all devices)
                device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: [
                        this.serviceUUID, 
                        '000018f0-0000-1000-8000-00805f9b34fb',
                        '0000ffe0-0000-1000-8000-00805f9b34fb',
                        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                        '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
                    ]
                });
                console.log('✅ Device found without filters');
            }

            console.log(`🔵 Found device: ${device.name}`);
            
            // Store device reference before connecting
            this.device = device;
            
            // Set up disconnect handler BEFORE connecting with enhanced error recovery
            const disconnectHandler = () => {
                console.log('⚠️ GATT Server disconnected - initiating recovery...');
                this.isConnected = false;
                this.printer = null;
                this.service = null;
                this.server = null;
                
                // Attempt automatic reconnection after a short delay
                setTimeout(async () => {
                    console.log('🔄 Attempting automatic reconnection...');
                    try {
                        const reconnected = await this.autoReconnect(1);
                        if (reconnected) {
                            console.log('✅ Automatic reconnection successful');
                        } else {
                            console.log('❌ Automatic reconnection failed');
                        }
                    } catch (error) {
                        console.log('❌ Auto-reconnection error:', error.message);
                    }
                }, 2000); // Wait 2 seconds before attempting reconnection
            };
            
            device.addEventListener('gattserverdisconnected', disconnectHandler);
            
            // Enhanced GATT connection with retry logic
            let connectionAttempts = 0;
            const maxAttempts = 3;
            
            while (connectionAttempts < maxAttempts) {
                try {
                    // Check if already connected
                    if (device.gatt.connected) {
                        console.log('🔵 Device already connected, using existing connection');
                        this.server = device.gatt;
                        break;
                    } else {
                        console.log(`🔄 Connecting to GATT server (attempt ${connectionAttempts + 1}/${maxAttempts})...`);
                        this.server = await device.gatt.connect();
                        console.log('✅ Connected to GATT server');
                        break;
                    }
                } catch (connectError) {
                    connectionAttempts++;
                    console.log(`❌ GATT connection attempt ${connectionAttempts} failed:`, connectError.message);
                    
                    if (connectionAttempts >= maxAttempts) {
                        throw new Error(`Failed to connect to GATT server after ${maxAttempts} attempts: ${connectError.message}`);
                    }
                    
                    // Wait before retry
                    // Delay removed for maximum speed
                }
            }
            
            // Verify connection is stable before proceeding
            if (!this.server || !device.gatt.connected) {
                throw new Error('GATT server connection verification failed');
            }
            
            // Add delay to ensure connection is stable
            // Delay removed for maximum speed
            
            // Enhanced service discovery with error recovery
            console.log('🔍 Discovering services...');
            let services;
            try {
                services = await this.server.getPrimaryServices();
                console.log(`📋 Found ${services.length} services:`);
            } catch (serviceError) {
                console.log('❌ Failed to get primary services, retrying...');
                // Delay removed for maximum speed
                services = await this.server.getPrimaryServices();
                console.log(`📋 Found ${services.length} services on retry:`);
            }
            
            for (const svc of services) {
                console.log(`Service UUID: ${svc.uuid}`);
                try {
                    const characteristics = await svc.getCharacteristics();
                    console.log(`  Service ${svc.uuid} has ${characteristics.length} characteristics:`);
                    for (const char of characteristics) {
                        console.log(`    Characteristic: ${char.uuid} (properties: ${Object.keys(char.properties).filter(p => char.properties[p]).join(', ')})`);
                    }
                } catch (err) {
                    console.log(`  Could not get characteristics for service ${svc.uuid}`);
                }
            }
            
            // Enhanced characteristic discovery with fallback options
            let service, characteristic;
            
            for (const svc of services) {
                try {
                    const characteristics = await svc.getCharacteristics();
                    for (const char of characteristics) {
                        // Look for characteristics that support writing
                        if (char.properties.write || char.properties.writeWithoutResponse) {
                            console.log(`✅ Found writable characteristic: ${char.uuid} in service: ${svc.uuid}`);
                            console.log(`   Write: ${char.properties.write}, WriteWithoutResponse: ${char.properties.writeWithoutResponse}`);
                            service = svc;
                            characteristic = char;
                            break;
                        }
                    }
                    if (characteristic) break;
                } catch (err) {
                    console.log(`⚠️ Error examining service ${svc.uuid}:`, err.message);
                }
            }
            
            if (!service || !characteristic) {
                console.log('❌ No writable characteristics found. Available services:');
                for (const svc of services) {
                    console.log(`- ${svc.uuid}`);
                }
                throw new Error('Could not find any writable characteristic for printing. Check console for available services.');
            }
            
            console.log(`🔧 Using service: ${service.uuid}`);
            console.log(`🔧 Using characteristic: ${characteristic.uuid}`);
            
            this.printer = characteristic;
            this.service = service;
            this.isConnected = true;
            
            // Test the connection with a simple command
            console.log('🧪 Testing connection stability...');
            try {
                // Send a simple reset command to verify the connection works
                const testData = new Uint8Array([0x1B, 0x40]); // ESC @ reset
                if (characteristic.properties.writeWithoutResponse) {
                    await characteristic.writeValueWithoutResponse(testData);
                } else {
                    await characteristic.writeValue(testData);
                }
                console.log('✅ Connection test successful');
            } catch (testError) {
                console.log('⚠️ Connection test failed:', testError.message);
                // Don't fail the connection for this, but log it
            }
            
            console.log(`✅ Successfully connected to printer: ${device.name}`);
            console.log(`🔧 Using service: ${service.uuid}`);
            console.log(`🔧 Using characteristic: ${characteristic.uuid}`);
            
            return { success: true, message: `Connected to ${device.name}` };
            
        } catch (error) {
            console.error('❌ Failed to connect to printer:', error);
            this.isConnected = false;
            this.device = null;
            this.server = null;
            this.service = null;
            this.printer = null;
            throw new Error(`Connection failed: ${error.message}`);
        }
    }

    // Disconnect from printer
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        this.printer = null;
        console.log('Disconnected from printer');
    }

    // 🚀 FAST & RELIABLE TRANSMISSION - Small chunks with tiny delays for reliability
    async sendData(data) {
        console.log(`🚀 FAST MODE: Sending ${data.length} characters with small chunks and tiny delays`);
        
        // Convert to bytes
        const bytes = new TextEncoder().encode(data);
        
        // Use small chunks with tiny delays for reliable transmission
        const chunkSize = 100; // Smaller chunks for reliability
        console.log(`📤 Sending ${bytes.length} bytes in chunks of ${chunkSize} with 5ms delays`);
        
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize);
            console.log(`📦 Sending chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(bytes.length/chunkSize)}: ${chunk.length} bytes`);
            
            await this.printer.writeValueWithoutResponse(chunk);
            
            // Small 5ms delay between chunks for reliability
            if (i + chunkSize < bytes.length) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
        }
        
        console.log(`✅ FAST TRANSMISSION COMPLETE: All ${bytes.length} bytes sent with small delays!`);
        return true;
    }

    // Try G5-specific initialization sequence
    async initializePrinter() {
        console.log('Initializing G5 with specific sequence...');
        
        // G5-specific initialization (similar to what iOS app might use)
        const initSequence = [
            '\x1B\x40',      // ESC @ - Initialize
            '\x1B\x33\x00',  // Set line spacing to 0
            '\x1C\x2E',      // Cancel Chinese mode
            '\x1B\x74\x00',  // Select character set
            '\x1B\x52\x00',  // Select international character set
        ];
        
        for (const cmd of initSequence) {
            console.log(`Sending init command: ${JSON.stringify(cmd)}`);
            await this.sendData(cmd);
            // Delay removed for maximum speed
        }
        
        // Wait longer for G5 to process
        // Delay removed for maximum speed
        console.log('G5 initialization complete');
    }

    // Print customer bag label using proven working thermal commands
    async printCustomerLabel(order, quantity = 1) {
        console.log('🔍 Ensuring connection before printing...');
        
        // Ensure connection is stable before starting
        try {
            await this.ensureConnection();
        } catch (error) {
            console.error('❌ Connection check failed:', error);
            throw new Error(`Printer connection failed: ${error.message}`);
        }

        try {
            console.log(`🏷️ Creating ${quantity} customer label(s) using bitmap text...`);
            console.log('🔍 Order data received:', JSON.stringify(order, null, 2));
            
            // Prepare comprehensive label data
            let orderId = order.orderId || order.orderNumber || order._id?.slice(-6) || 'N/A';
            // Remove "ORD" prefix if present, keeping only the number
            if (orderId.startsWith('ORD')) {
                orderId = orderId.substring(3).trim();
            }
            
            const customerName = (order.customerName || 'N/A').toUpperCase();
            const phoneNumber = (order.customerPhone || 'N/A');
            const now = new Date();
            const pickupDate = now.toLocaleDateString('en-US', {month: '2-digit', day: '2-digit'});
            const pickupTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const address = (order.address || 'NOT SPECIFIED').toUpperCase();
            
            // Additional order details
            const serviceType = order.serviceType || order.items?.[0]?.serviceName || 'STANDARD';
            const weight = order.weight ? `${order.weight} LBS` : 'TBD';
            const total = order.totalPrice || order.totalAmount || 0;
            const notes = order.notes || order.specialInstructions || '';

            // Print multiple labels
            for (let i = 1; i <= quantity; i++) {
                console.log(`🏷️ Printing label ${i} of ${quantity}...`);
                
                try {
                    console.log('📤 Step 1: Initializing printer...');
                    // Initialize printer for each label
                    await this.sendRawData(new Uint8Array([0x1B, 0x40])); // Reset
                    await this.sendRawData(new Uint8Array([0x1B, 0x37, 0x07, 0x64, 0x64])); // Heat settings
                    await this.sendRawData(new Uint8Array([0x1B, 0x38, 0x07, 0x64, 0x64])); // Density settings
                    // Delay removed for maximum speed // Conservative init delay
                    
                    console.log('📤 Step 2: Adding LARGER top margin...');
                    // Add MUCH larger top margin for better positioning - prevent letter cutting
                    await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x18])); // Go 24 empty lines for top margin
                    // Delay removed for maximum speed

                    console.log('📤 Step 3: Skipping header (removed)...');
                
                    console.log('📤 Step 4: Adding extra margin before order info...');
                    // Add extra blank lines before first text  
                    await this.printBitmapText('', false, false, 1);
                    await this.printBitmapText('', false, false, 1);
                    await this.printBitmapText('', false, false, 1);
                    
                    console.log('📤 Step 5: Sending BASIC INFO BLOCK (Order, Name, Phone) with EXTENDED delays...');
                    // Send basic info together and wait for printer to process with MUCH longer delays
                    await this.printBitmapText(`ORDER: ${orderId}`, false, false, 3);
                    console.log('📤 ORDER SENT - Waiting 1000ms for large text processing...');
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Much longer wait for large text
                    
                    await this.printBitmapText(customerName, false, false, 3);
                    console.log('📤 NAME SENT - Waiting 1000ms for large text processing...');
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Much longer wait for large text
                    
                    await this.printBitmapText(`PHONE: ${phoneNumber}`, false, false, 2);
                    console.log('📤 PHONE SENT - Waiting 1500ms for printer confirmation...');
                    
                    console.log('📤 BASIC INFO BLOCK COMPLETE - Waiting for printer full confirmation (1500ms)...');
                    await new Promise(resolve => setTimeout(resolve, 1500)); // Much longer confirmation wait
                    
                    console.log('📤 Step 6: Skipping service details (removed)...');
                    // Total removed
                    
                    console.log('📤 Step 7: Sending pickup info with EXTENDED wait...');
                    await this.printBitmapText(`PICKUP: ${pickupDate} ${pickupTime}`, false, false, 2);
                    console.log('📤 PICKUP SENT - Waiting 800ms for processing...');
                    await new Promise(resolve => setTimeout(resolve, 800)); // Much longer wait
                    
                    console.log('📤 Step 8: Sending bag info (if needed) with EXTENDED wait...');
                    if (quantity > 1) {
                        await this.printBitmapText(`BAG ${i} OF ${quantity}`, false, false, 3);
                        console.log('📤 BAG INFO SENT - Waiting 1000ms for large text processing...');
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Much longer wait for large text
                    }
                    
                    console.log('📤 Step 9: Sending address with EXTENDED wait...');
                    // ADDRESS - Split long addresses into multiple lines for better printing
                    await this.printBitmapText('ADDRESS:', false, false, 2);
                    console.log('📤 ADDRESS HEADER SENT - Waiting 600ms for processing...');
                    await new Promise(resolve => setTimeout(resolve, 600)); // Much longer wait for address header
                    
                    // Split address if it's too long for one line (max ~20 chars for 2x scale)
                    const maxLineLength = 20;
                    if (address.length > maxLineLength) {
                        // Split at word boundaries or commas
                        const words = address.split(/\s+|,/);
                        let currentLine = '';
                        
                        for (let j = 0; j < words.length; j++) {
                            const word = words[j].trim();
                            if (!word) continue;
                            
                            if (currentLine.length + word.length + 1 <= maxLineLength) {
                                currentLine += (currentLine ? ' ' : '') + word;
                            } else {
                                // Print current line and start new one
                                if (currentLine) {
                                    await this.printBitmapText(currentLine, false, false, 2);
                                    // Delay removed for maximum speed
                                }
                                currentLine = word;
                            }
                        }
                        
                        // Print remaining line
                        if (currentLine) {
                            await this.printBitmapText(currentLine, false, false, 2);
                            // Delay removed for maximum speed
                        }
                    } else {
                        await this.printBitmapText(address, false, false, 2);
                        // Delay removed for maximum speed
                    }
                    
                    console.log('📤 Step 10: Printing notes (if any)...');
                    // NOTES if present
                    if (notes && notes.trim()) {
                        await this.printBitmapText('NOTES:', false, false, 2);
                        // Delay removed for maximum speed
                        await this.printBitmapText(notes.toUpperCase(), false, false, 1);
                        // Delay removed for maximum speed
                    }
                    
                    console.log('📤 Step 11: Printing footer...');
                    // FOOTER with instructions (driver line removed)
                    await this.printBitmapText('==============================', false, false, 1);
                    // Delay removed for maximum speed
                    
                    console.log('📤 Step 12: Final spacing and paper feed to next label...');
                    // Add spacing lines first  
                    await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x06])); // ESC J 6 (add 6 lines spacing)
                    await new Promise(resolve => setTimeout(resolve, 300)); // Wait for spacing to complete
                    
                    console.log('📤 Step 13: Sending paper feed to advance to next label...');
                    // Now send paper feed to advance to next label
                    await this.sendRawData(new Uint8Array([0x0C])); // Form Feed command to advance paper
                    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for paper feed to complete
                    
                    console.log(`✅ Label ${i} completed successfully with paper feed!`);
                    
                } catch (labelError) {
                    console.error(`❌ Error printing label ${i}:`, labelError);
                    throw labelError; // Re-throw to be caught by outer try-catch
                }
                
                // Minimal delay between labels for speed
                if (i < quantity) {
                    // Delay removed for maximum speed // Back to original 500ms delay
                }
            }
            
            console.log(`🏷️ ${quantity} customer bitmap label(s) sent to printer!`);
            return { success: true, message: `${quantity} customer label(s) printed successfully` };
            
        } catch (error) {
            console.error('Print failed:', error);
            throw error;
        }
    }

    // Format customer label for bag tags
    formatCustomerLabel(order) {
        const now = new Date();
        const pickupDate = now.toLocaleDateString();
        const pickupTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        // Build label with ESC/POS commands
        const label = [
            // Header removed
            
            // Customer Info
            '\x1B\x21\x01', // Bold
            `Customer: ${order.customerName}\n`,
            '\x1B\x21\x00', // Normal
            `Phone: ${order.customerPhone || 'N/A'}\n`,
            `Order: #${order.orderId || order._id?.slice(-6) || 'N/A'}\n`,
            '\n',
            
            // Pickup Information
            '\x1B\x21\x01', // Bold
            'PICKUP DETAILS:\n',
            '\x1B\x21\x00', // Normal
            `Date: ${pickupDate}\n`,
            `Time: ${pickupTime}\n`,
            `Address: ${order.address || 'Not specified'}\n`,
            '\n',
            
            // Service Details (removed)
            `Type: ${order.orderType || 'Drop-off'}\n`,
            '\n',
            
            // Special Instructions
            order.notes ? `Notes: ${order.notes}\n` : '',
            order.notes ? '\n' : '',
            
            // QR Code placeholder (if supported)
            '\x1B\x61\x01', // Center
            '[QR: ' + (order.orderId || order._id?.slice(-8)) + ']\n',
            '\n',
            
            // Footer (driver and bags lines removed)
            '\x1B\x61\x01', // Center
            'Thank you!\n',
            '\x1B\x61\x00', // Left align
        ].join('');

        return label;
    }

    // LPAPI-Style Canvas Methods (Web Bluetooth Implementation)

    // Initialize label canvas (equivalent to LPAPI startDraw)
    async startDraw(width, height, orientation = 0) {
        console.log(`📝 Starting canvas: ${width}mm x ${height}mm, orientation: ${orientation}`);
        
        this.canvasWidth = width;
        this.canvasHeight = height; 
        this.canvasOrientation = orientation;
        this.canvasCommands = [];
        this.isDrawing = true;
        this.currentAlignment = 0;
        
        // Send initialization commands based on LPAPI pattern
        const initCommands = [
            [0x1B, 0x40],           // ESC @ - Initialize printer
            [0x1B, 0x33, 0x00],     // Set line spacing to 0
            [0x1C, 0x2E],           // Cancel Chinese mode
        ];
        
        for (const cmd of initCommands) {
            this.canvasCommands.push(new Uint8Array(cmd));
        }
        
        return true;
    }

    // Set text alignment (equivalent to LPAPI setItemHorizontalAlignment)
    async setAlignment(alignment) {
        this.currentAlignment = alignment; // 0=left, 1=center, 2=right
        
        // ESC/POS alignment commands
        const alignmentCmd = [0x1B, 0x61, alignment];
        this.canvasCommands.push(new Uint8Array(alignmentCmd));
        
        return true;
    }

    // Draw text on canvas (equivalent to LPAPI drawText)
    async drawText(text, x, y, width, height, fontHeight, fontStyle = 0) {
        if (!this.isDrawing) {
            throw new Error('Must call startDraw() first');
        }
        
        console.log(`📝 Drawing text: "${text}" at (${x},${y}) size ${fontHeight}`);
        
        // Convert fontStyle to ESC/POS (0=normal, 1=bold)
        const styleCmd = fontStyle === 1 ? [0x1B, 0x21, 0x08] : [0x1B, 0x21, 0x00];
        this.canvasCommands.push(new Uint8Array(styleCmd));
        
        // Add text with newline
        const textBytes = new TextEncoder().encode(text + '\n');
        this.canvasCommands.push(textBytes);
        
        // Reset to normal style
        this.canvasCommands.push(new Uint8Array([0x1B, 0x21, 0x00]));
        
        return true;
    }

    // Draw rectangle (equivalent to LPAPI drawRectangle)
    async drawRectangle(x, y, width, height, lineWidth, isFilled) {
        console.log(`📝 Drawing rectangle at (${x},${y}) size ${width}x${height}`);
        
        // For thermal printers, we'll simulate with text characters
        const topBottom = '='.repeat(Math.floor(width / 2));
        const textBytes = new TextEncoder().encode(topBottom + '\n');
        this.canvasCommands.push(textBytes);
        
        return true;
    }

    // Draw line (equivalent to LPAPI drawLine)
    async drawLine(x, y, width, height) {
        console.log(`📝 Drawing line at (${x},${y}) size ${width}x${height}`);
        
        const lineStr = '='.repeat(Math.floor(width / 2)) + '\n';
        const textBytes = new TextEncoder().encode(lineStr);
        this.canvasCommands.push(textBytes);
        
        return true;
    }

    // Draw QR code (equivalent to LPAPI drawQRCode)
    async drawQRCode(text, x, y, width) {
        console.log(`📝 Drawing QR code: "${text}" at (${x},${y}) size ${width}`);
        
        // For now, simulate with text placeholder (real QR would require complex bitmap generation)
        await this.setAlignment(1); // Center QR code
        const qrText = `[QR: ${text}]\n`;
        const textBytes = new TextEncoder().encode(qrText);
        this.canvasCommands.push(textBytes);
        
        return true;
    }

    // Finalize canvas (equivalent to LPAPI endDraw) 
    async endDraw() {
        if (!this.isDrawing) {
            throw new Error('No drawing session active');
        }
        
        console.log(`📝 Finalizing canvas with ${this.canvasCommands.length} commands`);
        
        // Add final formatting
        this.canvasCommands.push(new Uint8Array([0x1B, 0x61, 0x00])); // Left align
        this.canvasCommands.push(new TextEncoder().encode('\n\n')); // Extra spacing
        
        this.isDrawing = false;
        return true;
    }

    // Print the canvas (equivalent to LPAPI print)
    async printCanvas() {
        if (this.canvasCommands.length === 0) {
            throw new Error('No canvas to print. Call startDraw() and draw elements first.');
        }
        
        console.log(`🖨️ Printing canvas with ${this.canvasCommands.length} commands...`);
        
        // Send all canvas commands in sequence
        for (let i = 0; i < this.canvasCommands.length; i++) {
            const cmd = this.canvasCommands[i];
            console.log(`📤 Sending command ${i + 1}/${this.canvasCommands.length}`);
            await this.sendRawData(cmd);
            
            // Small delay between commands
            // Delay removed for maximum speed
        }
        
        // Feed paper after printing
        await this.sendRawData(new Uint8Array([0x1B, 0x64, 0x03])); // Feed 3 lines
        
        // Clear canvas
        this.canvasCommands = [];
        
        console.log('🖨️ Canvas printing complete!');
        return true;
    }

    // Bitmap font data for common characters (8x8 pixels) - Enhanced with address characters
    getBitmapFont() {
        // Cache font for better performance
        if (this.cachedBitmapFont) {
            return this.cachedBitmapFont;
        }
        
        this.cachedBitmapFont = {
            ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // Space
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
            
            // Additional characters for addresses
            '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x00], // Period
            ',': [0x00, 0x00, 0x00, 0x00, 0x18, 0x18, 0x30, 0x00], // Comma
            '-': [0x00, 0x00, 0x00, 0x7E, 0x00, 0x00, 0x00, 0x00], // Hyphen/Dash
            '/': [0x00, 0x03, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x00], // Forward slash
            '\\': [0x00, 0x60, 0x30, 0x18, 0x0C, 0x06, 0x03, 0x00], // Backslash
            '_': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7F, 0x00], // Underscore
            '(': [0x0C, 0x18, 0x30, 0x30, 0x30, 0x18, 0x0C, 0x00], // Left parenthesis
            ')': [0x30, 0x18, 0x0C, 0x0C, 0x0C, 0x18, 0x30, 0x00], // Right parenthesis
            '+': [0x00, 0x18, 0x18, 0x7E, 0x18, 0x18, 0x00, 0x00], // Plus
            '=': [0x00, 0x00, 0x7E, 0x00, 0x7E, 0x00, 0x00, 0x00], // Equals
            '&': [0x1C, 0x36, 0x1C, 0x6E, 0x3B, 0x33, 0x6E, 0x00], // Ampersand
            '*': [0x00, 0x66, 0x3C, 0xFF, 0x3C, 0x66, 0x00, 0x00], // Asterisk
            '@': [0x3E, 0x63, 0x7B, 0x7B, 0x7B, 0x03, 0x1E, 0x00], // At sign
            '%': [0x63, 0x63, 0x06, 0x0C, 0x18, 0x63, 0x63, 0x00], // Percent
            '!': [0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00], // Exclamation
            '?': [0x3C, 0x66, 0x06, 0x0C, 0x18, 0x00, 0x18, 0x00], // Question mark
            ';': [0x00, 0x00, 0x18, 0x00, 0x18, 0x18, 0x30, 0x00], // Semicolon
            "'": [0x06, 0x0C, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00], // Apostrophe
            '"': [0x66, 0x66, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00], // Quote
            '[': [0x3C, 0x30, 0x30, 0x30, 0x30, 0x30, 0x3C, 0x00], // Left bracket
            ']': [0x3C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x3C, 0x00], // Right bracket
            '{': [0x0E, 0x18, 0x18, 0x70, 0x18, 0x18, 0x0E, 0x00], // Left brace
            '}': [0x70, 0x18, 0x18, 0x0E, 0x18, 0x18, 0x70, 0x00], // Right brace
            '|': [0x18, 0x18, 0x18, 0x00, 0x18, 0x18, 0x18, 0x00], // Pipe
            '~': [0x00, 0x00, 0x71, 0x8E, 0x00, 0x00, 0x00, 0x00], // Tilde
            '`': [0x30, 0x18, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00], // Backtick
            '<': [0x06, 0x0C, 0x18, 0x30, 0x18, 0x0C, 0x06, 0x00], // Less than
            '>': [0x60, 0x30, 0x18, 0x0C, 0x18, 0x30, 0x60, 0x00], // Greater than
            '$': [0x18, 0x3E, 0x60, 0x3C, 0x06, 0x7C, 0x18, 0x00]  // Dollar sign
        };
        
        return this.cachedBitmapFont;
    }

    // Use official DothanTech bitmap commands for G5 printer
    async printBitmapText(text, centerAlign = false, feedPaper = true, scaleFactor = 2) {
        const font = this.getBitmapFont();
        const cleanText = text.replace(/\n/g, ''); // Keep original case for special characters
        
        if (cleanText.length === 0) return;
        
        console.log(`Printing bitmap for: "${cleanText}" at ${scaleFactor}x scale`);
        
        // Check for unsupported characters and create cleaned version
        const unsupportedChars = [];
        let finalText = '';
        
        for (const char of cleanText) {
            const upperChar = char.toUpperCase();
            if (font[char] || font[upperChar] || char === ' ') {
                // Character is supported
                finalText += char;
            } else {
                // Character not supported - replace with space and log
                if (!unsupportedChars.includes(char)) {
                    unsupportedChars.push(char);
                }
                finalText += ' '; // Replace with space for safety
            }
        }
        
        if (unsupportedChars.length > 0) {
            console.log(`⚠️ Warning: Unsupported characters found: [${unsupportedChars.join(', ')}] - replaced with spaces`);
            console.log(`📝 Original text: "${cleanText}"`);
            console.log(`📝 Cleaned text: "${finalText}"`);
        }
        
        const charCount = finalText.length;
        
        // Calculate character bitmap size
        const charWidthDots = 8;
        const charHeightDots = 8;
        const scaledCharWidth = charWidthDots * scaleFactor;
        const scaledCharHeight = charHeightDots * scaleFactor;
        
        // For 57mm labels, we have approximately 48 bytes (384 dots) width
        // Force a fixed width bitmap that starts from the left edge
        const labelWidthBytes = 48; // Fixed width for consistent left alignment
        const textWidthDots = charCount * scaledCharWidth;
        const textWidthBytes = Math.ceil(textWidthDots / 8);
        
        console.log(`Label width: ${labelWidthBytes} bytes, text width: ${textWidthBytes} bytes`);
        
        // Build complete bitmap line by line - always start from left (byte 0)
        for (let row = 0; row < charHeightDots; row++) {
            // Scale each row vertically
            for (let scaleY = 0; scaleY < scaleFactor; scaleY++) {
                // Create fixed-width row data starting from left
                const rowData = new Array(labelWidthBytes).fill(0);
                
                // Center the text on the label
                const labelWidthDots = labelWidthBytes * 8;
                const textStartBit = Math.floor((labelWidthDots - textWidthDots) / 2);
                let bitPosition = textStartBit;
                
                // Process each character in this row
                for (let charIndex = 0; charIndex < charCount; charIndex++) {
                    const char = finalText[charIndex];
                    // Try exact match first, then uppercase, then fallback to space (should always find a match now)
                    const bitmap = font[char] || font[char.toUpperCase()] || font[' '];
                    const charRowByte = bitmap[row] || 0x00;
                    
                    // Scale this character horizontally by expanding bits
                    for (let bit = 7; bit >= 0; bit--) {
                        const bitValue = (charRowByte >> bit) & 1;
                        // Scale horizontally: repeat each bit scaleFactor times
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
                
                // Send this row using DothanTech command - guaranteed left alignment
                try {
                    const leadingBlanks = 0; // Always start from leftmost position
                    const command = [0x1F, 0x2B, leadingBlanks, rowData.length, ...rowData];
                    await this.sendRawData(new Uint8Array(command));
                    
                    // NO DELAY - Maximum speed
                } catch (rowError) {
                    console.error(`❌ Error sending bitmap row ${row + 1}:`, rowError.message);
                    // Continue with next row instead of failing completely
                }
            }
        }
        
        // Add line spacing after text - INSTANT
        await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x04])); // Go 4 empty lines for spacing
        
        // Only feed paper if requested (for end of complete label)
        if (feedPaper) {
            await this.sendRawData(new Uint8Array([0x0C])); // Locate to next paper boundary
        }
    }

    // Simple text test to verify connection
    async printTestLabelCanvas() {
        if (!this.isConnected) {
            throw new Error('Printer not connected');
        }

        try {
            console.log('🧪 Testing simple text print...');
            
            // Initialize with proven thermal activation
            await this.sendRawData(new Uint8Array([0x1B, 0x40])); // Reset
            await this.sendRawData(new Uint8Array([0x1B, 0x37, 0x07, 0x64, 0x64])); // Heat settings
            await this.sendRawData(new Uint8Array([0x1B, 0x38, 0x07, 0x64, 0x64])); // Density settings
            // Delay removed for maximum speed
            
            console.log('📱 Printing complete label test...');
            
            // Add top margin for better positioning
            await this.sendRawData(new Uint8Array([0x1B, 0x4A, 0x08])); // Go 8 empty lines for top margin
            
            // Test width limits for 57mm labels - let's see how much fits
            await this.printBitmapText('12345678901234567890123456789012', false, false); // 32 chars test
            // Delay removed for maximum speed
            await this.printBitmapText('CUSTOMER: JOHN SMITH DOE', false, false); // 24 chars
            // Delay removed for maximum speed
            await this.printBitmapText('ORDER: #123456', false, false); // 14 chars
            // Delay removed for maximum speed
            await this.printBitmapText('PHONE: 555-123-4567', false, true); // 19 chars - Feed paper at the end
            
            // Ensure paper feed happens
            await this.sendRawData(new Uint8Array([0x1B, 0x64, 0x05])); // Additional feed lines
            // Delay removed for maximum speed
            
            console.log('✅ Bitmap text test complete!');
            console.log('📋 Should see readable text:');
            console.log('   - HELLO WORLD');
            console.log('   - LAUNDROMAT');
            console.log('   - CUSTOMER: JOHN DOE');
            console.log('   - ORDER: #12345');
            console.log('   - PHONE: 555-0123');
            
            return { success: true, message: 'Bitmap text test complete - check for readable text!' };
            
        } catch (error) {
            console.error('Text mode test failed:', error);
            throw error;
        }
    }

    // Try using Official LPAPI Web Interface
    async testDothanTechWebSDK() {
        try {
            console.log('🌐 Testing Official LPAPI Web Interface...');
            
            // Check if the official LPAPI is loaded
            if (typeof window !== 'undefined' && window.LPAPI) {
                console.log('✅ Official LPAPI JavaScript found!');
                
                try {
                    // Create LPAPI instance (like in Android demo)
                    const lpapi = new window.LPAPI();
                    console.log('📱 LPAPI instance created');
                    
                    // Try to get available printers
                    console.log('🔍 Getting available printers...');
                    const printers = lpapi.getAllPrinters();
                    console.log('📋 Available printers:', printers);
                    
                    // Try to open G5 printer (like Android demo line 44)
                    console.log('🔗 Attempting to open G5 printer...');
                    const opened = lpapi.openPrinterSync('G5-40280365');
                    console.log('📱 Open result:', opened);
                    
                    if (opened) {
                        console.log('✅ G5 printer opened successfully!');
                        
                        // Create test label (exactly like Android demo lines 56-66)
                        console.log('🖨️ Creating test label...');
                        lpapi.startJob(40, 30, 0);  // width, height, rotation
                        lpapi.drawRectangle(0, 0, 40, 30, 0.5);  // border
                        lpapi.setItemHorizontalAlignment(1);  // center text
                        lpapi.drawText('LPAPI TEST', 5, 5, 30, 8, 4, 1);  // title
                        lpapi.setItemHorizontalAlignment(0);  // left align
                        lpapi.drawText('Official API', 5, 15, 30, 6, 3, 0);  // subtitle
                        lpapi.drawText('G5 Printing', 5, 22, 30, 6, 3, 0);  // subtitle
                        lpapi.commitJob();  // Send to printer
                        
                        console.log('🖨️ Official LPAPI test label sent!');
                        return { success: true, message: 'Official LPAPI test completed - check printer!' };
                        
                    } else {
                        console.log('❌ Failed to open G5 printer');
                        return { success: false, message: 'Could not open G5-40280365 printer via LPAPI' };
                    }
                    
                } catch (apiError) {
                    console.error('LPAPI operation failed:', apiError);
                    return { success: false, message: 'LPAPI operation failed: ' + apiError.message };
                }
                
            } else if (typeof window !== 'undefined' && window.DzLPAPI) {
                console.log('✅ DzLPAPI bridge found!');
                console.log('📱 This indicates Android WebView integration');
                return { success: true, message: 'DzLPAPI Android bridge detected' };
                
            } else {
                console.log('❌ Official LPAPI not found');
                console.log('💡 Available window objects:', Object.keys(window).filter(k => k.includes('LP') || k.includes('DT') || k.includes('print')));
                return { success: false, message: 'Official LPAPI interface not available' };
            }
            
        } catch (error) {
            console.error('LPAPI test failed:', error);
            return { success: false, message: 'LPAPI test failed: ' + error.message };
        }
    }

    // Comprehensive test with multiple protocols and debugging
    async printTestLabel() {
        if (!this.isConnected) {
            throw new Error('Printer not connected');
        }

        try {
            console.log('🔍 Starting comprehensive printer diagnostic...');
            
            // Test 1: Manual feed button test
            console.log('📋 TEST 1: Manual feed test');
            console.log('👉 PLEASE: Press the feed button on your NT-G5 now');
            console.log('   - Does paper advance? (This tests the paper mechanism)');
            // Delay removed for maximum speed
            
            // Test 2: Try ESC/POS commands (some NT-G5s support this)
            console.log('📋 TEST 2: ESC/POS compatibility test...');
            await this.sendRawData(new Uint8Array([0x1B, 0x40])); // Reset
            // Delay removed for maximum speed
            await this.sendData('HELLO WORLD\n\n\n'); // Try text mode
            // Delay removed for maximum speed
            
            // Test 3: Alternative bitmap formats
            console.log('📋 TEST 3: Alternative bitmap formats...');
            
            // Format A: Command + length + data
            await this.sendRawData(new Uint8Array([0xA2, 0x01, 0xFF])); // 1 byte of data
            // Delay removed for maximum speed
            
            // Format B: Command + width + height + data  
            await this.sendRawData(new Uint8Array([0xA2, 0x08, 0x01, 0xFF])); // 8 pixels wide, 1 high
            // Delay removed for maximum speed
            
            // Format C: Different command altogether
            await this.sendRawData(new Uint8Array([0xA3, 0xFF])); // Alternative command
            // Delay removed for maximum speed
            
            // Test 4: Try print head activation directly
            console.log('📋 TEST 4: Direct thermal head activation...');
            await this.sendRawData(new Uint8Array([0xAF, 0xFF])); // Max energy
            await this.sendRawData(new Uint8Array([0xA4, 0xFF])); // Max quality
            await this.sendRawData(new Uint8Array([0xBE, 0x01])); // Set mode
            // Delay removed for maximum speed
            
            // Now try bitmap
            await this.sendRawData(new Uint8Array([0xA2, 0xFF])); // Single line
            // Delay removed for maximum speed
            
            // Test 5: Raw thermal activation (bypass all formatting)
            console.log('📋 TEST 5: Raw thermal activation...');
            // Send raw heating pattern
            await this.sendRawData(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF])); // Raw heat pattern
            // Delay removed for maximum speed
            
            // Test 6: Paper feed with different commands
            console.log('📋 TEST 6: Paper feed variations...');
            await this.sendRawData(new Uint8Array([0xA1])); // Standard feed
            await this.sendRawData(new Uint8Array([0x0A])); // Line feed
            await this.sendRawData(new Uint8Array([0x0C])); // Form feed
            await this.sendRawData(new Uint8Array([0x1B, 0x64, 0x02])); // ESC d (feed 2 lines)
            
            console.log('🔍 Diagnostic complete! Results:');
            console.log('📋 Check your printed paper for ANY marks from tests 2-6');
            console.log('');
            console.log('💡 If NO marks appeared:');
            console.log('   1. Paper might not be thermal (scratch test: does fingernail leave dark mark?)');
            console.log('   2. Paper might be upside down (thermal side should face print head)');
            console.log('   3. Print head might need cleaning');
            console.log('   4. Battery might be too low');
            console.log('   5. Your specific G5 model might use different commands');
            console.log('');
            console.log('✅ If ANY marks appeared, we can work with that format!');
            
            return { success: true, message: 'Diagnostic complete - check paper for results' };
            
        } catch (error) {
            console.error('Diagnostic failed:', error);
            throw error;
        }
    }

    // Create simple bitmap for testing (draws "TEST" pattern)
    createSimpleTestBitmap() {
        // Simple 8x64 pixel bitmap spelling "TEST" in dots
        const width = 64; // pixels
        const height = 8;  // pixels
        const bytes = new Uint8Array(width * height / 8);
        
        // Simple pattern: alternating lines to test if bitmap works
        for (let i = 0; i < bytes.length; i++) {
            if (i % 2 === 0) {
                bytes[i] = 0xFF; // Full line
            } else {
                bytes[i] = 0x00; // Empty line
            }
        }
        
        return bytes;
    }

    // 🚀 FAST & RELIABLE RAW DATA TRANSMISSION - Small chunks with tiny delays
    async sendRawData(data) {
        if (!this.isConnected || !this.printer) {
            throw new Error('Printer not connected');
        }

        try {
            console.log(`🚀 FAST RAW DATA: Sending ${data.length} raw bytes with small chunks and tiny delays`);
            
            const canWriteWithoutResponse = this.printer.properties.writeWithoutResponse;
            const canWrite = this.printer.properties.write;
            
            // Use small chunks with tiny delays for reliable transmission
            const chunkSize = 100; // Smaller chunks for reliability
            console.log(`📤 Sending ${data.length} raw bytes in chunks of ${chunkSize} with 5ms delays`);
            
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                console.log(`📦 Sending raw chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(data.length/chunkSize)}: ${chunk.length} bytes`);
                
                if (canWriteWithoutResponse) {
                    await this.printer.writeValueWithoutResponse(chunk);
                } else if (canWrite) {
                    await this.printer.writeValue(chunk);
                } else {
                    throw new Error('No write methods available');
                }
                
                // Small 5ms delay between chunks for reliability
                if (i + chunkSize < data.length) {
                    await new Promise(resolve => setTimeout(resolve, 5));
                }
            }
            
            console.log(`✅ FAST RAW TRANSMISSION COMPLETE: All ${data.length} raw bytes sent with small delays!`);
            return true;
        } catch (error) {
            console.error('Failed to send raw data:', error);
            throw error;
        }
    }

    // Add packet logging to capture working commands
    async enablePacketLogging() {
        if (!this.isConnected || !this.printer) {
            throw new Error('Printer not connected');
        }

        try {
            console.log('🔍 PACKET LOGGING ENABLED');
            console.log('📱 Now use your wePrint iOS app to print a simple label');
            console.log('👀 I will monitor what commands it sends...');
            
            // Try to listen for notifications (if the characteristic supports it)
            if (this.printer.properties.notify) {
                await this.printer.startNotifications();
                this.printer.addEventListener('characteristicvaluechanged', (event) => {
                    const data = new Uint8Array(event.target.value.buffer);
                    console.log('📥 RECEIVED FROM PRINTER:', Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                });
                console.log('📥 Notification listening enabled');
            }

            // Log our send function
            const originalSendData = this.sendRawData.bind(this);
            this.sendRawData = async (data) => {
                console.log('📤 OUR COMMAND:', Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                return originalSendData(data);
            };

            return { success: true, message: 'Packet logging enabled - use wePrint app now' };
            
        } catch (error) {
            console.error('Failed to enable packet logging:', error);
            throw error;
        }
    }

    // Test with iOS app-inspired commands
    async testIOSCommands() {
        if (!this.isConnected) {
            throw new Error('Printer not connected');
        }

        try {
            console.log('🍎 Testing iOS app-inspired command sequences...');

            // Sequence 1: Common iOS thermal printer initialization
            console.log('📱 Test 1: iOS-style initialization...');
            const iosInit = [
                [0x1B, 0x40],           // ESC @ reset
                [0x1B, 0x61, 0x01],     // Center alignment
                [0x1B, 0x21, 0x30],     // Double width/height
            ];
            
            for (const cmd of iosInit) {
                await this.sendRawData(new Uint8Array(cmd));
                // Delay removed for maximum speed
            }

            // Send simple text
            await this.sendData('iOS TEST\n\n');
            
            // Sequence 2: Try raw bitmap like iOS apps use
            console.log('📱 Test 2: iOS-style bitmap...');
            await this.sendRawData(new Uint8Array([0x1D, 0x76, 0x30, 0x00])); // GS v 0 bitmap
            await this.sendRawData(new Uint8Array([8, 0, 1, 0])); // 8 bytes wide, 1 line
            await this.sendRawData(new Uint8Array([0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00])); // Striped pattern
            
            // Sequence 3: Try wePrint-style commands
            console.log('📱 Test 3: wePrint-style commands...');
            await this.sendRawData(new Uint8Array([0x1B, 0x33, 0x00])); // Line spacing
            await this.sendData('wePrint Style\n');
            
            // Paper feeds
            await this.sendRawData(new Uint8Array([0x1B, 0x64, 0x03])); // Feed 3 lines
            
            console.log('🍎 iOS-style tests complete!');
            return { success: true, message: 'iOS-style commands sent' };

        } catch (error) {
            console.error('iOS command test failed:', error);
            throw error;
        }
    }

    // iOS-specific workaround: Generate printable label for iOS native printing
    generatePrintableLabel(order, quantity = 1) {
        console.log('📱 Generating iOS-compatible label for native printing...');
        
        let orderId = order.orderId || order._id?.slice(-6) || 'N/A';
        if (orderId.startsWith('ORD')) {
            orderId = orderId.substring(3).trim();
        }
        
        const customerName = (order.customerName || 'N/A').toUpperCase();
        const phoneNumber = (order.customerPhone || 'N/A');
        const now = new Date();
        const pickupDate = now.toLocaleDateString('en-US', {month: '2-digit', day: '2-digit'});
        const address = (order.address || 'NOT SPECIFIED').toUpperCase();

        const labels = [];
        for (let i = 1; i <= quantity; i++) {
            const label = {
                orderId,
                customerName,
                phoneNumber,
                pickupDate,
                address,
                bagNumber: quantity > 1 ? `BAG ${i} OF ${quantity}` : null
            };
            labels.push(label);
        }
        
        return labels;
    }

    // iOS Web Share API for printing
    async shareForPrinting(order, quantity = 1) {
        const labels = this.generatePrintableLabel(order, quantity);
        
        // Create text representation for sharing
        const labelText = labels.map(label => 
            `ORDER: ${label.orderId}\n` +
            `CUSTOMER: ${label.customerName}\n` +
            `PHONE: ${label.phoneNumber}\n` +
            `DATE: ${label.pickupDate}\n` +
            (label.bagNumber ? `${label.bagNumber}\n` : '') +
            `ADDRESS: ${label.address}\n` +
            `\n${'='.repeat(32)}\n`
        ).join('\n');

        // Check if HTTPS is available for Web Share API
        const isHTTPS = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost';
        
        // Try wePrint app first - copy to clipboard then open app
        try {
            // Copy the label text to clipboard first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(labelText);
            }
            
            // Then open wePrint app (it should detect clipboard content)
            window.location.href = 'weprint://';
            
            return { success: true, message: 'Opening wePrint app - label copied to clipboard. Tap "New Label" then paste the text.' };
        } catch (wePrintError) {
            console.log('wePrint app method failed, trying other approaches...');
        }

        // Try iOS Shortcuts as backup
        const shortcutURL = `shortcuts://run-shortcut?name=Print%20G5%20Label&input=text&text=${encodeURIComponent(labelText)}`;
        
        try {
            // Try to open iOS Shortcut for direct printing
            window.location.href = shortcutURL;
            return { success: true, message: 'Opening iOS Shortcut for direct printing...' };
        } catch (shortcutError) {
            console.log('iOS Shortcut not available, trying Web Share...');
        }

        if (navigator.share && (isHTTPS || isLocalhost)) {
            try {
                await navigator.share({
                    title: 'Customer Bag Labels',
                    text: labelText
                });
                return { success: true, message: 'Label shared for printing' };
            } catch (error) {
                console.error('Share failed:', error);
                // Fallback to other methods
            }
        }

        // Fallback methods that work without HTTPS
        try {
            // Try clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(labelText);
                return { success: true, message: 'Label copied to clipboard - paste in Notes or Messages app to print' };
            }
        } catch (clipboardError) {
            console.log('Clipboard API failed, trying textarea method...');
        }

        // Ultimate fallback: Create textarea and copy manually
        const textarea = document.createElement('textarea');
        textarea.value = labelText;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            
            if (successful) {
                return { success: true, message: 'Label copied! Go to Notes app and paste, then print or share' };
            } else {
                throw new Error('Copy command failed');
            }
        } catch (err) {
            document.body.removeChild(textarea);
            
            // Show the label in an alert as last resort
            alert(`Label data (copy this text):\n\n${labelText}`);
            return { success: true, message: 'Label displayed - copy the text from the alert' };
        }
    }

    // Connect to an existing device (helper method)
    async connectToDevice(device) {
        console.log('Connecting to device:', device.name);
        
        this.device = device;
        
        // Setup disconnect handler
        this.device.addEventListener('gattserverdisconnected', () => {
            console.log('Device disconnected');
            this.isConnected = false;
        });
        
        console.log('Connecting to GATT server...');
        this.server = await this.device.gatt.connect();
        
        console.log('Getting thermal printer service...');
        this.service = await this.server.getPrimaryService(this.serviceUUID);
        
        console.log('Getting print characteristic...');
        this.characteristic = await this.service.getCharacteristic(this.characteristicUUID);
        
        this.isConnected = true;
        console.log('✅ Successfully connected to printer:', device.name);
    }

    // Check for existing connections
    async checkExistingConnection() {
        try {
            console.log('🔍 Starting connection detection check...');
            console.log('🔍 Current state - isConnected:', this.isConnected, 'device:', this.device?.name, 'printer:', !!this.printer);
            
            // If we already have a connected device and working printer reference, just return true
            if (this.isConnected && this.device?.gatt?.connected && this.printer) {
                console.log('🔵 Existing connection found and active with printer reference');
                return true;
            }
            
            // Check if there's a device stored in the service that's still connected
            if (this.device && this.device.gatt?.connected) {
                console.log('🔵 Found existing GATT connection for device:', this.device.name);
                
                // Make sure we have the printer characteristic reference
                if (!this.printer) {
                    console.log('🔧 Restoring printer characteristic reference...');
                    try {
                        // Get the service and characteristic again
                        const services = await this.device.gatt.getPrimaryServices();
                        console.log('🔍 Available services:', services.map(s => s.uuid));
                        
                        let service, characteristic;
                        
                        // Try to find a writable characteristic like we do in connect()
                        for (const svc of services) {
                            try {
                                const characteristics = await svc.getCharacteristics();
                                for (const char of characteristics) {
                                    if (char.properties.write || char.properties.writeWithoutResponse) {
                                        console.log('🔵 Found writable characteristic:', char.uuid, 'in service:', svc.uuid);
                                        service = svc;
                                        characteristic = char;
                                        break;
                                    }
                                }
                                if (characteristic) break;
                            } catch (err) {
                                console.log(`🔍 Error examining service ${svc.uuid}:`, err.message);
                            }
                        }
                        
                        if (characteristic) {
                            this.printer = characteristic;
                            this.service = service;
                            this.server = this.device.gatt;
                            this.isConnected = true;
                            
                            console.log('✅ Restored printer reference for existing connection');
                            return true;
                        } else {
                            console.log('❌ Could not find writable characteristic on existing connection');
                        }
                    } catch (restoreError) {
                        console.log('❌ Failed to restore printer reference:', restoreError.message);
                    }
                } else {
                    this.isConnected = true;
                    return true;
                }
            }
            
            // Try to get previously granted devices
            if (navigator.bluetooth?.getDevices) {
                const devices = await navigator.bluetooth.getDevices();
                console.log('🔍 Found previously granted devices:', devices.length);
                
                // Look for a G5 printer among granted devices
                for (const device of devices) {
                    console.log('🔍 Checking device:', device.name, 'GATT connected:', device.gatt?.connected);
                    
                    if (device.name?.includes('G5') || 
                        device.name?.includes('Netum') ||
                        device.name?.includes('G5-40280365')) {
                        
                        console.log('📱 Found previously paired G5 device:', device.name);
                        
                        // Try to connect to this device
                        try {
                            if (device.gatt?.connected) {
                                console.log('✅ Device already connected via GATT, setting up references...');
                                this.device = device;
                                
                                // Set up disconnect handler
                                device.addEventListener('gattserverdisconnected', () => {
                                    console.log('Device disconnected during auto-detection');
                                    this.isConnected = false;
                                    this.printer = null;
                                });
                                
                                // Set up the service and characteristic
                                try {
                                    const services = await device.gatt.getPrimaryServices();
                                    console.log('🔍 Available services on existing device:', services.map(s => s.uuid));
                                    
                                    let service, characteristic;
                                    
                                    // Try to find a writable characteristic
                                    for (const svc of services) {
                                        try {
                                            const characteristics = await svc.getCharacteristics();
                                            for (const char of characteristics) {
                                                if (char.properties.write || char.properties.writeWithoutResponse) {
                                                    console.log('🔵 Found writable characteristic:', char.uuid, 'in service:', svc.uuid);
                                                    service = svc;
                                                    characteristic = char;
                                                    break;
                                                }
                                            }
                                            if (characteristic) break;
                                        } catch (err) {
                                            console.log(`🔍 Error examining service ${svc.uuid}:`, err.message);
                                        }
                                    }
                                    
                                    if (characteristic) {
                                        this.printer = characteristic;
                                        this.service = service;
                                        this.server = device.gatt;
                                        this.isConnected = true;
                                        
                                        console.log('✅ Successfully restored connection to existing device:', device.name);
                                        return true;
                                    } else {
                                        console.log('❌ Could not find writable characteristic on existing device');
                                    }
                                } catch (setupError) {
                                    console.log('❌ Failed to setup characteristics for existing device:', setupError.message);
                                }
                            } else {
                                console.log('🔄 Device was paired but GATT disconnected, attempting reconnect...');
                                try {
                                    await this.connectToDevice(device);
                                    return true;
                                } catch (reconnectError) {
                                    console.log('❌ Reconnection failed:', reconnectError.message);
                                }
                            }
                        } catch (reconnectError) {
                            console.log('❌ Could not process device:', reconnectError.message);
                            // Continue to next device
                        }
                    }
                }
            }
            
            console.log('🔍 No existing connections found');
            return false;
        } catch (error) {
            console.log('🔍 Error checking existing connection:', error.message);
            return false;
        }
    }

    // Get connection status
    getStatus() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        return {
            isConnected: this.isConnected,
            deviceName: this.device?.name || null,
            isBluetoothSupported: this.isBluetoothSupported(),
            isIOS: isIOS,
            alternativeMethod: isIOS ? 'iOS Share/Print' : null
        };
    }

    // Enhanced auto-reconnect functionality with improved error handling
    async autoReconnect(retries = 3) {
        console.log(`🔄 Starting auto-reconnection (${retries} attempts)...`);
        
        for (let i = 0; i < retries; i++) {
            try {
                console.log(`🔄 Reconnection attempt ${i + 1}/${retries}`);
                
                // Reset connection state before attempting reconnection
                this.isConnected = false;
                this.printer = null;
                this.service = null;
                this.server = null;
                
                // If we have a device but it's disconnected, try to reconnect directly
                if (this.device) {
                    console.log(`🔄 Attempting direct GATT reconnection to ${this.device.name}...`);
                    
                    try {
                        // Force disconnect first to clean up any stale connections
                        if (this.device.gatt.connected) {
                            console.log('🔄 Forcing disconnect of stale connection...');
                            this.device.gatt.disconnect();
                            // Delay removed for maximum speed
                        }
                        
                        // Attempt fresh connection
                        console.log('🔄 Establishing fresh GATT connection...');
                        this.server = await this.device.gatt.connect();
                        console.log('✅ GATT reconnection successful');
                        
                        // Wait for connection to stabilize
                        // Delay removed for maximum speed
                        
                        // Verify connection is stable
                        if (!this.device.gatt.connected) {
                            throw new Error('GATT connection unstable after reconnect');
                        }
                        
                        // Re-establish service and characteristic with error handling
                        console.log('🔍 Re-discovering services...');
                        const services = await this.server.getPrimaryServices();
                        console.log(`📋 Found ${services.length} services after reconnection`);
                        
                        let foundChar = false;
                        for (const svc of services) {
                            try {
                                const characteristics = await svc.getCharacteristics();
                                for (const char of characteristics) {
                                    if (char.properties.write || char.properties.writeWithoutResponse) {
                                        console.log(`✅ Re-established characteristic: ${char.uuid}`);
                                        this.printer = char;
                                        this.service = svc;
                                        this.isConnected = true;
                                        foundChar = true;
                                        break;
                                    }
                                }
                                if (foundChar) break;
                            } catch (err) {
                                console.log(`⚠️ Error examining service ${svc.uuid}:`, err.message);
                            }
                        }
                        
                        if (!foundChar) {
                            throw new Error('No writable characteristic found after reconnection');
                        }
                        
                        // Test the reconnection with a simple command
                        console.log('🧪 Testing reconnected connection...');
                        try {
                            const testData = new Uint8Array([0x1B, 0x40]); // ESC @ reset
                            if (this.printer.properties.writeWithoutResponse) {
                                await this.printer.writeValueWithoutResponse(testData);
                            } else {
                                await this.printer.writeValue(testData);
                            }
                            console.log('✅ Connection test passed after reconnection');
                        } catch (testError) {
                            console.log('⚠️ Connection test failed after reconnection:', testError.message);
                            throw new Error('Reconnected connection failed test');
                        }
                        
                        console.log(`✅ Direct reconnection successful!`);
                        return true;
                        
                    } catch (directError) {
                        console.log(`❌ Direct reconnection failed:`, directError.message);
                        // Continue to full reconnection process
                    }
                }
                
                // If direct reconnection failed, try full connect process
                console.log('🔄 Attempting full connection process...');
                try {
                    // Clear device reference for fresh start
                    const savedDeviceName = this.device?.name;
                    this.device = null;
                    
                    // Attempt full reconnection
                    await this.connect();
                    console.log(`✅ Full reconnection successful to ${savedDeviceName || 'printer'}!`);
                    return true;
                    
                } catch (fullConnectError) {
                    console.log(`❌ Full reconnection failed:`, fullConnectError.message);
                    throw fullConnectError;
                }
                
            } catch (error) {
                console.log(`❌ Reconnection attempt ${i + 1} failed:`, error.message);
                if (i < retries - 1) {
                    const waitTime = Math.min(2000 * (i + 1), 5000); // Progressive backoff
                    console.log(`⏳ Waiting ${waitTime}ms before next attempt...`);
                    // Delay removed for maximum speed
                } else {
                    console.log(`❌ All reconnection attempts failed after ${retries} tries`);
                }
            }
        }
        
        console.log(`❌ Auto-reconnection failed after ${retries} attempts`);
        return false;
    }
    
    // Enhanced connection validation and recovery
    async validateConnection() {
        console.log('🔍 Validating printer connection...');
        
        // Check basic connection state
        if (!this.isConnected) {
            console.log('❌ Service reports not connected');
            throw new Error('Printer not connected - please connect first');
        }
        
        if (!this.device) {
            console.log('❌ No device reference');
            throw new Error('No printer device found');
        }
        
        if (!this.printer) {
            console.log('❌ No printer characteristic');
            throw new Error('Printer characteristic not available');
        }
        
        // Check GATT connection status
        if (!this.device.gatt?.connected) {
            console.log('❌ GATT server not connected, attempting recovery...');
            const reconnected = await this.autoReconnect(2);
            if (!reconnected) {
                throw new Error('Unable to restore GATT connection to printer');
            }
            console.log('✅ GATT connection restored');
        }
        
        // Additional validation - check if characteristic is still valid
        try {
            // Try to access characteristic properties to verify it's still valid
            const hasWrite = this.printer.properties?.write;
            const hasWriteWithoutResponse = this.printer.properties?.writeWithoutResponse;
            
            if (!hasWrite && !hasWriteWithoutResponse) {
                console.log('❌ Printer characteristic lost write capabilities');
                throw new Error('Printer characteristic no longer writable');
            }
            
            console.log('✅ Connection validation passed');
            return true;
            
        } catch (validationError) {
            console.log('❌ Characteristic validation failed:', validationError.message);
            console.log('🔄 Attempting connection recovery...');
            
            const reconnected = await this.autoReconnect(2);
            if (!reconnected) {
                throw new Error('Unable to recover printer connection after validation failure');
            }
            
            console.log('✅ Connection recovered after validation failure');
            return true;
        }
    }
    
    // Check and reconnect if needed before any operation (legacy method)
    async ensureConnection() {
        return await this.validateConnection();
    }
}

// React hook for using Bluetooth printer
export const useBluetoothPrinter = () => {
    const [printer] = useState(() => new BluetoothPrinterService());
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState(null);

    // Check for existing connections when component mounts
    useEffect(() => {
        const checkExistingConnection = async () => {
            console.log('🔍 Checking for existing Bluetooth connections...');
            try {
                const hasConnection = await printer.checkExistingConnection();
                if (hasConnection) {
                    console.log('✅ Found existing connection, updating state');
                    setIsConnected(true);
                    setError(null);
                } else {
                    console.log('❌ No existing connection found');
                }
            } catch (error) {
                console.log('❌ Error checking existing connection:', error.message);
                setError(`Connection check failed: ${error.message}`);
            }
        };

        checkExistingConnection();
    }, [printer]);

    const connect = async () => {
        setIsConnecting(true);
        setError(null);
        try {
            await printer.connect();
            setIsConnected(true);
            return true;
        } catch (err) {
            setError(err.message);
            setIsConnected(false);
            return false;
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnect = async () => {
        await printer.disconnect();
        setIsConnected(false);
    };

    const printLabel = async (order, quantity = 1) => {
        try {
            setError(null);
            return await printer.printCustomerLabel(order, quantity);
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const printTest = async () => {
        try {
            setError(null);
            return await printer.printTestLabelCanvas();
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const testIOSCommands = async () => {
        try {
            setError(null);
            return await printer.testIOSCommands();
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const enableLogging = async () => {
        try {
            setError(null);
            return await printer.enablePacketLogging();
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const testWebSDK = async () => {
        try {
            setError(null);
            return await printer.testDothanTechWebSDK();
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const shareForPrinting = async (order, quantity = 1) => {
        try {
            setError(null);
            return await printer.shareForPrinting(order, quantity);
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const status = printer.getStatus();

    return {
        printer,
        isConnected,
        isConnecting,
        error,
        connect,
        disconnect,
        printLabel,
        printTest,
        testIOSCommands,
        enableLogging,
        testWebSDK,
        shareForPrinting,
        isIOS: status.isIOS,
        isSupported: printer.isBluetoothSupported()
    };
};

export default BluetoothPrinterService;