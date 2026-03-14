import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Platform, useWindowDimensions, Modal, PanResponder } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { ScannerProvider, FloatingActionButtons } from '../contexts/ScannerContext';
import { TimeClockProvider, useTimeClock } from '../contexts/TimeClockContext';
import { StorePhoneProvider, useStorePhone } from '../contexts/StorePhoneContext';
import pushNotificationService from '../services/pushNotifications';
import { syncAllCustomersToContacts } from '../services/contactsSync';
import { registerBackgroundSync } from '../services/backgroundSync';
import { api } from '../services/api';

// Navigation ref for use outside of components (e.g., notification handling)
export const navigationRef = React.createRef<NavigationContainerRef<any>>();

// Navigate to a screen from anywhere
export function navigate(name: string, params?: object) {
  if (navigationRef.current?.isReady()) {
    // @ts-ignore - Navigation types are complex
    navigationRef.current.navigate(name, params);
  }
}

// Screens
import LoginScreen from '../screens/LoginScreen';
import LocationSelectionScreen from '../screens/LocationSelectionScreen';
import DashboardScreen from '../screens/DashboardScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import EditOrderScreen from '../screens/EditOrderScreen';
import CreateOrderScreen from '../screens/CreateOrderScreen';
import CreateCustomerScreen from '../screens/CreateCustomerScreen';
import EditCustomerScreen from '../screens/EditCustomerScreen';
import CashierReportScreen from '../screens/CashierReportScreen';
import EODReportScreen from '../screens/EODReportScreen';
import DriverScreen from '../screens/DriverScreen';
import AdminScreen from '../screens/AdminScreen';
import ProfileScreen from '../screens/ProfileScreen';
import BluetoothPrinterScreen from '../screens/BluetoothPrinterScreen';
import ClockInScreen from '../screens/ClockInScreen';
import DeliveryPaymentsScreen from '../screens/DeliveryPaymentsScreen';
import KioskLoginScreen from '../screens/KioskLoginScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Store Phone tabs - simplified view with only Orders and Customers
function StorePhoneTabs() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Detect landscape mode
  const isLandscape = width > height && width >= 700;

  // Calculate tab bar style
  const getTabBarStyle = () => {
    if (isLandscape) {
      return { display: 'none' as const };
    }

    if (Platform.OS === 'android') {
      const bottomPadding = Math.max(insets.bottom, 24);
      return {
        paddingBottom: bottomPadding,
        paddingTop: 8,
        height: 60 + bottomPadding,
      };
    }
    return {
      paddingBottom: 8,
      paddingTop: 8,
      height: 60,
    };
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Orders') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          } else if (route.name === 'Customers') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: getTabBarStyle(),
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Orders" component={DashboardScreen} />
      <Tab.Screen
        name="Customers"
        component={AdminScreen}
        initialParams={{ screen: 'customers' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function MainTabs() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isCashier = user?.role === 'cashier';
  const canAccessDriver = isAdmin || user?.isDriver;
  const canAccessAdmin = isAdmin || isCashier; // Cashiers get limited admin access

  // Detect landscape mode
  const isLandscape = width > height && width >= 700;

  // Calculate tab bar style based on platform and orientation
  const getTabBarStyle = () => {
    // Hide tab bar in landscape mode
    if (isLandscape) {
      return { display: 'none' as const };
    }

    if (Platform.OS === 'android') {
      // Android: Add extra padding for system navigation bar
      const bottomPadding = Math.max(insets.bottom, 24);
      return {
        paddingBottom: bottomPadding,
        paddingTop: 8,
        height: 60 + bottomPadding,
      };
    }
    // iOS: Keep original style
    return {
      paddingBottom: 8,
      paddingTop: 8,
      height: 60,
    };
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Driver') {
            iconName = focused ? 'car' : 'car-outline';
          } else if (route.name === 'Admin') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: getTabBarStyle(),
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      {canAccessDriver && (
        <Tab.Screen name="Driver" component={DriverScreen} />
      )}
      {canAccessAdmin && (
        <Tab.Screen name="Admin" component={AdminScreen} />
      )}
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function MainStack() {
  const { isStorePhoneMode } = useStorePhone();

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        component={isStorePhoneMode ? StorePhoneTabs : MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{
          title: 'Order Details',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1e293b',
        }}
      />
      <Stack.Screen
        name="CreateOrder"
        component={CreateOrderScreen}
        options={{
          title: 'New Order',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1e293b',
        }}
      />
      <Stack.Screen
        name="EditOrder"
        component={EditOrderScreen}
        options={{
          title: 'Edit Order',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1e293b',
        }}
      />
      <Stack.Screen
        name="CreateCustomer"
        component={CreateCustomerScreen}
        options={{
          title: 'New Customer',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1e293b',
        }}
      />
      <Stack.Screen
        name="EditCustomer"
        component={EditCustomerScreen}
        options={{
          title: 'Edit Customer',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1e293b',
        }}
      />
      <Stack.Screen
        name="CashierReport"
        component={CashierReportScreen}
        options={{
          title: 'Cashier Report',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1e293b',
        }}
      />
      <Stack.Screen
        name="EODReport"
        component={EODReportScreen}
        options={{
          title: 'End of Day Report',
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#1e293b',
        }}
      />
      <Stack.Screen
        name="BluetoothPrinter"
        component={BluetoothPrinterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DeliveryPayments"
        component={DeliveryPaymentsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function ClockInPrompt() {
  const { showClockInPrompt, dismissClockInPrompt } = useTimeClock();

  if (!showClockInPrompt) return null;

  return (
    <Modal
      visible={showClockInPrompt}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <ClockInScreen
        mode="clock_in"
        onComplete={dismissClockInPrompt}
        onDismiss={dismissClockInPrompt}
      />
    </Modal>
  );
}

const STORE_PHONE_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

function AuthenticatedAppContent() {
  const { user, logout } = useAuth();
  const { isStorePhoneMode } = useStorePhone();
  const isKioskMode = user?.isKioskMode;
  const [showPinLock, setShowPinLock] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPinLockRef = useRef(() => setShowPinLock(true));
  const contactsSynced = useRef(false);

  // Keep ref current
  useEffect(() => { showPinLockRef.current = () => setShowPinLock(true); }, []);

  // PanResponder created once — uses ref so it's always fresh
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => showPinLockRef.current(), STORE_PHONE_IDLE_TIMEOUT);
        return false;
      },
    })
  ).current;

  // Start idle timer when store phone mode is active
  useEffect(() => {
    if (!isStorePhoneMode) {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      return;
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => showPinLockRef.current(), STORE_PHONE_IDLE_TIMEOUT);
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [isStorePhoneMode]);

  // Sync all customers to iOS contacts on every login
  // Uses SecureStore cache — only new customers are added on subsequent launches
  useEffect(() => {
    if (contactsSynced.current) return;
    contactsSynced.current = true;
    console.log('[ContactsSync] Scheduling contacts sync in 10s...');
    const timer = setTimeout(async () => {
      try {
        const customers = await api.getCustomers();
        if (customers?.length) {
          const result = await syncAllCustomersToContacts(customers);
          console.log('[ContactsSync] Done:', result);
        }
        // Register background sync so new contacts sync even when app is closed
        registerBackgroundSync();
      } catch (e) {
        console.log('[ContactsSync] Error:', e);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  // PIN lock modal — shown after idle timeout on store phones
  const pinLockModal = showPinLock ? (
    <Modal visible={showPinLock} animationType="slide" presentationStyle="fullScreen">
      <KioskLoginScreen
        onBack={() => {
          // Back button = full logout
          logout();
          setShowPinLock(false);
        }}
        onLoginSuccess={() => {
          // PIN accepted (same or different user) — dismiss lock
          setShowPinLock(false);
          // Reset idle timer
          if (idleTimer.current) clearTimeout(idleTimer.current);
          if (isStorePhoneMode) {
            idleTimer.current = setTimeout(() => showPinLockRef.current(), STORE_PHONE_IDLE_TIMEOUT);
          }
        }}
      />
    </Modal>
  ) : null;

  // Kiosk mode or store phone mode: skip time clock provider, clock-in prompt, and floating buttons
  if (isKioskMode || isStorePhoneMode) {
    return (
      <View style={{ flex: 1 }} {...(isStorePhoneMode ? panResponder.panHandlers : {})}>
        <ScannerProvider>
          <MainStack />
          {/* No FloatingActionButtons or ClockInPrompt in kiosk/POS/store phone mode */}
        </ScannerProvider>
        {pinLockModal}
      </View>
    );
  }

  return (
    <TimeClockProvider>
      <ScannerProvider>
        <MainStack />
        <FloatingActionButtons />
        <ClockInPrompt />
      </ScannerProvider>
    </TimeClockProvider>
  );
}

function AuthenticatedApp() {
  return (
    <StorePhoneProvider>
      <AuthenticatedAppContent />
    </StorePhoneProvider>
  );
}

// Handle notification response (when user taps on notification)
function handleNotificationResponse(response: any) {
  const data = response?.notification?.request?.content?.data;
  console.log('Notification tapped, data:', data);

  if (data?.orderId) {
    // Navigate to order detail screen
    navigate('OrderDetail', { orderId: data.orderId });
  }
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { currentLocation, isLoadingLocations, availableLocations, refreshLocations } = useLocation();
  const notificationResponseListener = useRef<any>(null);
  const hasRefreshedLocations = useRef(false);

  // Refresh locations when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading && availableLocations.length === 0 && !hasRefreshedLocations.current) {
      hasRefreshedLocations.current = true;
      console.log('Refreshing locations after auth...');
      refreshLocations();
    }
    if (!isAuthenticated) {
      hasRefreshedLocations.current = false;
    }
  }, [isAuthenticated, isLoading, availableLocations.length]);

  useEffect(() => {
    // Set up notification response listener (when user taps notification)
    notificationResponseListener.current = pushNotificationService.addNotificationResponseListener(
      handleNotificationResponse
    );

    // Check if app was opened from a killed state via notification
    // This handles the cold start case
    const checkInitialNotification = async () => {
      try {
        const Notifications = require('expo-notifications');
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
          console.log('App opened from notification (cold start):', response);
          handleNotificationResponse(response);
        }
      } catch (e) {
        // Notifications not available
      }
    };

    // Small delay to ensure navigation is ready
    setTimeout(checkInitialNotification, 500);

    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
    };
  }, []);

  if (isLoading || (isAuthenticated && isLoadingLocations)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  // Determine what to show based on auth and location state
  const getContent = () => {
    if (!isAuthenticated) {
      return <AuthStack />;
    }

    // If authenticated but no location selected, and there are multiple locations
    // show the location selection screen
    if (!currentLocation && availableLocations.length > 1) {
      return <LocationSelectionScreen />;
    }

    // If only one location, auto-select it
    // This is handled in AuthContext after login

    return <AuthenticatedApp />;
  };

  return (
    <NavigationContainer ref={navigationRef}>
      {getContent()}
    </NavigationContainer>
  );
}
