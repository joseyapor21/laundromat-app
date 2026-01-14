import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';

interface ScannerContextType {
  showScanner: boolean;
  openScanner: () => void;
  closeScanner: () => void;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export function useScanner() {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScanner must be used within a ScannerProvider');
  }
  return context;
}

interface ScannerProviderProps {
  children: ReactNode;
}

export function ScannerProvider({ children }: ScannerProviderProps) {
  const [showScanner, setShowScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const navigation = useNavigation<any>();

  const openScanner = useCallback(async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to scan QR codes');
        return;
      }
    }
    setShowScanner(true);
  }, [permission, requestPermission]);

  const closeScanner = useCallback(() => {
    setShowScanner(false);
    setIsProcessing(false);
  }, []);

  const handleBarCodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      // Check if it's a customer QR code
      if (data.startsWith('CUSTOMER:')) {
        const customerId = data.replace('CUSTOMER:', '').trim();
        closeScanner();
        navigation.navigate('EditCustomer', { customerId });
        return;
      }

      // Try to find order by QR code (order ID)
      const orderId = parseInt(data.trim());
      if (!isNaN(orderId)) {
        const orders = await api.getOrders();
        const order = orders.find((o: any) => o.orderId === orderId);
        if (order) {
          closeScanner();
          navigation.navigate('OrderDetail', { orderId: order._id });
          return;
        }
      }

      // Try as machine QR code - just show alert for now
      // Machine scanning is typically done from OrderDetailScreen
      Alert.alert(
        'QR Code Scanned',
        `Code: ${data}\n\nTo assign a machine to an order, scan from the order detail screen.`,
        [{ text: 'OK', onPress: () => setIsProcessing(false) }]
      );
    } catch (error) {
      console.error('Scan error:', error);
      Alert.alert('Error', 'Failed to process QR code');
      setIsProcessing(false);
    }
  }, [isProcessing, closeScanner, navigation]);

  return (
    <ScannerContext.Provider value={{ showScanner, openScanner, closeScanner }}>
      {children}

      {/* Global Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={closeScanner}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan QR Code</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeScanner}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={isProcessing ? undefined : handleBarCodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
          </View>
          <View style={styles.scannerHint}>
            <Text style={styles.scannerHintText}>
              Scan order tickets, customer cards, or machine QR codes
            </Text>
          </View>
        </View>
      </Modal>
    </ScannerContext.Provider>
  );
}

// Floating Scan Button Component
export function FloatingScanButton() {
  const { openScanner } = useScanner();

  return (
    <TouchableOpacity
      style={styles.floatingButton}
      onPress={openScanner}
      activeOpacity={0.8}
    >
      <Ionicons name="scan" size={28} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  scannerHintText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
});
