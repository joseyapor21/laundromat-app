import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Device } from 'react-native-ble-plx';
import { bluetoothPrinter } from '../services/BluetoothPrinter';

export default function BluetoothPrinterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();
  }, []);

  async function checkConnection() {
    const name = bluetoothPrinter.getConnectedDeviceName();
    setConnectedDeviceName(name);

    if (!name) {
      // Try to reconnect saved printer
      const reconnected = await bluetoothPrinter.reconnectSavedPrinter();
      if (reconnected) {
        setConnectedDeviceName(bluetoothPrinter.getConnectedDeviceName());
      }
    }
  }

  async function startScan() {
    setScanning(true);
    setDevices([]);

    await bluetoothPrinter.startScan((foundDevices) => {
      setDevices(foundDevices);
    });

    // Scan stops automatically after 10 seconds
    setTimeout(() => {
      setScanning(false);
    }, 10000);
  }

  function stopScan() {
    bluetoothPrinter.stopScan();
    setScanning(false);
  }

  async function connectToDevice(device: Device) {
    setConnecting(true);
    stopScan();

    const success = await bluetoothPrinter.connect(device);

    if (success) {
      setConnectedDeviceName(device.name || 'Unknown');
      Alert.alert('Connected', `Successfully connected to ${device.name}`);
    } else {
      Alert.alert('Connection Failed', 'Could not connect to the printer. Please try again.');
    }

    setConnecting(false);
  }

  async function disconnect() {
    await bluetoothPrinter.disconnect();
    setConnectedDeviceName(null);
    Alert.alert('Disconnected', 'Printer has been disconnected');
  }

  async function testPrint() {
    const success = await bluetoothPrinter.printText(
      'TEST PRINT\n' +
      '--------------------------------\n' +
      'Laundromat App\n' +
      'Printer connected successfully!\n' +
      '--------------------------------\n'
    );

    if (success) {
      Alert.alert('Success', 'Test print sent successfully');
    } else {
      Alert.alert('Error', 'Failed to print. Please check the printer connection.');
    }
  }

  const renderDevice = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => connectToDevice(item)}
      disabled={connecting}
    >
      <View style={styles.deviceInfo}>
        <Ionicons name="print-outline" size={24} color="#1e293b" />
        <View style={styles.deviceText}>
          <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
          <Text style={styles.deviceId}>{item.id}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bluetooth Printer</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Connected Printer Section */}
      {connectedDeviceName && (
        <View style={styles.connectedSection}>
          <View style={styles.connectedHeader}>
            <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            <Text style={styles.connectedTitle}>Connected Printer</Text>
          </View>
          <View style={styles.connectedDevice}>
            <Ionicons name="print" size={32} color="#2563eb" />
            <View style={styles.connectedInfo}>
              <Text style={styles.connectedName}>{connectedDeviceName}</Text>
              <Text style={styles.connectedStatus}>Ready to print</Text>
            </View>
          </View>
          <View style={styles.connectedActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.testButton]}
              onPress={testPrint}
            >
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Test Print</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.disconnectButton]}
              onPress={disconnect}
            >
              <Ionicons name="close-circle-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Scan Section */}
      <View style={styles.scanSection}>
        <View style={styles.scanHeader}>
          <Text style={styles.sectionTitle}>
            {connectedDeviceName ? 'Connect Another Printer' : 'Available Printers'}
          </Text>
          <TouchableOpacity
            style={[styles.scanButton, scanning && styles.scanButtonActive]}
            onPress={scanning ? stopScan : startScan}
            disabled={connecting}
          >
            {scanning ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="bluetooth" size={20} color="#fff" />
            )}
            <Text style={styles.scanButtonText}>
              {scanning ? 'Scanning...' : 'Scan'}
            </Text>
          </TouchableOpacity>
        </View>

        {connecting && (
          <View style={styles.connectingOverlay}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.connectingText}>Connecting to printer...</Text>
          </View>
        )}

        <FlatList
          data={devices}
          renderItem={renderDevice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.deviceList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name={scanning ? 'bluetooth-outline' : 'print-outline'}
                size={48}
                color="#cbd5e1"
              />
              <Text style={styles.emptyText}>
                {scanning
                  ? 'Searching for printers...'
                  : 'Tap "Scan" to search for Bluetooth printers'}
              </Text>
              <Text style={styles.emptySubtext}>
                Make sure your printer is turned on and in pairing mode
              </Text>
            </View>
          }
        />
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>Supported Printers</Text>
        <Text style={styles.instructionsText}>
          Most thermal receipt printers with Bluetooth are supported, including:
        </Text>
        <Text style={styles.instructionsList}>
          {'\u2022'} Star Micronics{'\n'}
          {'\u2022'} Epson TM Series{'\n'}
          {'\u2022'} Generic ESC/POS printers
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  connectedSection: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  connectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  connectedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  connectedDevice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  connectedInfo: {
    flex: 1,
  },
  connectedName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  connectedStatus: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  connectedActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  testButton: {
    backgroundColor: '#2563eb',
  },
  disconnectButton: {
    backgroundColor: '#ef4444',
  },
  scanSection: {
    flex: 1,
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  scanButtonActive: {
    backgroundColor: '#f59e0b',
  },
  scanButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  deviceList: {
    padding: 8,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 8,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceText: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
  },
  deviceId: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
  connectingOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  connectingText: {
    fontSize: 16,
    color: '#1e293b',
    marginTop: 16,
  },
  instructions: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    borderRadius: 16,
    padding: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
  },
  instructionsList: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
  },
});
