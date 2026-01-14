import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { ScannerProvider, FloatingActionButtons } from '../contexts/ScannerContext';
import pushNotificationService from '../services/pushNotifications';

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const canAccessDriver = isAdmin || user?.isDriver;

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
        tabBarStyle: {
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
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
      {isAdmin && (
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
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        component={MainTabs}
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
    </Stack.Navigator>
  );
}

function AuthenticatedApp() {
  return (
    <ScannerProvider>
      <MainStack />
      <FloatingActionButtons />
    </ScannerProvider>
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
  const notificationResponseListener = useRef<any>(null);

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

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {isAuthenticated ? <AuthenticatedApp /> : <AuthStack />}
    </NavigationContainer>
  );
}
