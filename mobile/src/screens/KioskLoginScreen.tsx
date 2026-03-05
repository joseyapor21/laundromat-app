import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import type { Location } from '../types';

interface KioskLoginScreenProps {
  onBack: () => void;
  onLoginSuccess: () => void;
}

export default function KioskLoginScreen({ onBack, onLoginSuccess }: KioskLoginScreenProps) {
  const { pinLogin } = useAuth();
  const { selectLocation } = useLocation();
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [loadingLocations, setLoadingLocations] = useState(true);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    // Fallback locations in case API is not deployed yet
    const fallbackLocations: Location[] = [
      { _id: '698a50c70e0b495ff489e1ee', name: 'E&F Laundromat #1', code: 'OG#1', address: '' },
      { _id: '698a55eae28eb750c51148c0', name: 'E&F Laundromat #2', code: 'DL#2', address: '' },
    ];

    try {
      // Use public endpoint (no auth required)
      const locs = await api.getPublicLocations();
      setLocations(locs);
      if (locs.length === 1) {
        setSelectedLocation(locs[0]);
      }
    } catch (error) {
      console.error('Failed to load locations, using fallback:', error);
      // Use fallback locations
      setLocations(fallbackLocations);
    } finally {
      setLoadingLocations(false);
    }
  }

  function handleNumpad(key: string) {
    if (key === 'C') {
      setPin('');
    } else if (key === '⌫') {
      setPin(prev => prev.slice(0, -1));
    } else if (pin.length < 4) {
      setPin(prev => prev + key);
    }
  }

  async function handleLogin() {
    if (!selectedLocation) {
      Alert.alert('Error', 'Please select a store location');
      return;
    }

    if (pin.length !== 4) {
      Alert.alert('Error', 'PIN must be 4 digits');
      return;
    }

    setIsLoading(true);
    try {
      const result = await pinLogin(pin, selectedLocation._id);
      await selectLocation(result.location);
      onLoginSuccess();
    } catch (error) {
      Alert.alert(
        'Login Failed',
        error instanceof Error ? error.message : 'Invalid PIN'
      );
      setPin('');
    } finally {
      setIsLoading(false);
    }
  }

  if (loadingLocations) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.title}>Kiosk Mode</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* Location Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Store</Text>
          <View style={styles.locationGrid}>
            {locations.map(location => (
              <TouchableOpacity
                key={location._id}
                style={[
                  styles.locationButton,
                  selectedLocation?._id === location._id && styles.locationButtonSelected
                ]}
                onPress={() => setSelectedLocation(location)}
              >
                <Ionicons
                  name="storefront"
                  size={24}
                  color={selectedLocation?._id === location._id ? '#fff' : '#2563eb'}
                />
                <Text style={[
                  styles.locationName,
                  selectedLocation?._id === location._id && styles.locationNameSelected
                ]}>
                  {location.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* PIN Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Enter Your PIN</Text>
          <View style={styles.pinDisplay}>
            {[0, 1, 2, 3].map(i => (
              <View
                key={i}
                style={[
                  styles.pinDot,
                  i < pin.length && styles.pinDotFilled
                ]}
              />
            ))}
          </View>
        </View>

        {/* Numpad */}
        <View style={styles.numpad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(key => (
            <TouchableOpacity
              key={key}
              style={[
                styles.numpadKey,
                key === 'C' && styles.numpadKeyClear,
                key === '⌫' && styles.numpadKeyBackspace
              ]}
              onPress={() => handleNumpad(key)}
            >
              {key === '⌫' ? (
                <Ionicons name="backspace-outline" size={28} color="#64748b" />
              ) : (
                <Text style={[
                  styles.numpadKeyText,
                  key === 'C' && styles.numpadKeyTextClear
                ]}>
                  {key}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.loginButton, (!selectedLocation || pin.length !== 4 || isLoading) && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={!selectedLocation || pin.length !== 4 || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={24} color="#fff" />
              <Text style={styles.loginButtonText}>Enter</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  content: {
    padding: 24,
    paddingBottom: 100,
    alignItems: 'center',
  },
  section: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
    textAlign: 'center',
  },
  locationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  locationButtonSelected: {
    backgroundColor: '#2563eb',
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  locationNameSelected: {
    color: '#fff',
  },
  pinDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  pinDotFilled: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 300,
    gap: 12,
    marginBottom: 32,
  },
  numpadKey: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  numpadKeyClear: {
    backgroundColor: '#fee2e2',
  },
  numpadKeyBackspace: {
    backgroundColor: '#f1f5f9',
  },
  numpadKeyText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#1e293b',
  },
  numpadKeyTextClear: {
    color: '#ef4444',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#10b981',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 16,
    width: '100%',
    maxWidth: 300,
  },
  loginButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  loginButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
});
