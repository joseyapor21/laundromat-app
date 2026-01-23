import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { useTimeClock } from './TimeClockContext';
import ClockInScreen from '../screens/ClockInScreen';

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

// Expandable Floating Action Button Component
export function FloatingActionButtons() {
  const { openScanner } = useScanner();
  const { isClockedIn, isLoading: isClockLoading } = useTimeClock();
  const navigation = useNavigation<any>();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showClockInModal, setShowClockInModal] = useState(false);
  const { width, height } = useWindowDimensions();

  // Detect landscape mode (tab bar hidden)
  const isLandscape = width > height && width >= 700;

  const handleAddOrder = () => {
    setIsExpanded(false);
    navigation.navigate('CreateOrder');
  };

  const handleScan = () => {
    setIsExpanded(false);
    openScanner();
  };

  const handleClockIn = () => {
    setIsExpanded(false);
    setShowClockInModal(true);
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      {/* Backdrop to close menu when tapping outside */}
      {isExpanded && (
        <TouchableOpacity
          style={styles.fabBackdrop}
          activeOpacity={1}
          onPress={() => setIsExpanded(false)}
        />
      )}

      <View style={[
        styles.fabContainer,
        isLandscape && styles.fabContainerLandscape
      ]}>
        {/* Expandable options */}
        {isExpanded && (
          <View style={styles.fabOptions}>
            {/* Clock In button - only show when not clocked in */}
            {!isClockedIn && !isClockLoading && (
              <TouchableOpacity
                style={[styles.fabOption, styles.fabOptionClockIn]}
                onPress={handleClockIn}
                activeOpacity={0.8}
              >
                <Ionicons name="time" size={22} color="#fff" />
                <Text style={styles.fabOptionLabel}>Clock In</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.fabOption, styles.fabOptionScan]}
              onPress={handleScan}
              activeOpacity={0.8}
            >
              <Ionicons name="qr-code" size={22} color="#fff" />
              <Text style={styles.fabOptionLabel}>Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fabOption, styles.fabOptionAdd]}
              onPress={handleAddOrder}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.fabOptionLabel}>New Order</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main FAB button */}
        <TouchableOpacity
          style={[styles.fabMain, isExpanded && styles.fabMainExpanded]}
          onPress={toggleExpanded}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isExpanded ? 'close' : 'apps'}
            size={28}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {/* Clock In Modal */}
      <Modal
        visible={showClockInModal}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <ClockInScreen
          mode="clock_in"
          onComplete={() => setShowClockInModal(false)}
          onDismiss={() => setShowClockInModal(false)}
        />
      </Modal>
    </>
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
  fabBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 998,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    alignItems: 'flex-end',
    zIndex: 1000,
  },
  fabContainerLandscape: {
    bottom: 20,
    right: 20,
  },
  fabOptions: {
    marginBottom: 12,
    gap: 10,
  },
  fabOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 25,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabOptionClockIn: {
    backgroundColor: '#22c55e',
  },
  fabOptionScan: {
    backgroundColor: '#f59e0b',
  },
  fabOptionAdd: {
    backgroundColor: '#2563eb',
  },
  fabOptionLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  fabMain: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabMainExpanded: {
    backgroundColor: '#64748b',
  },
});
