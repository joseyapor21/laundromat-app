import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { api } from '../services/api';
import { formatPhoneInput, unformatPhone } from '../utils/phoneFormat';
import AddressInput from '../components/AddressInput';

type CreateCustomerParams = {
  prefillName?: string;
  prefillPhone?: string;
};

export default function CreateCustomerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: CreateCustomerParams }, 'params'>>();
  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);
  const [saving, setSaving] = useState(false);

  // Form state - use route params for pre-filling if available
  const [name, setName] = useState(route.params?.prefillName || '');
  const [phoneNumber, setPhoneNumber] = useState(route.params?.prefillPhone || '');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [buzzerCode, setBuzzerCode] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    setSaving(true);
    try {
      const customerData: Record<string, string> = {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        address: address.trim(),
        deliveryFee: deliveryFee ? `$${parseFloat(deliveryFee).toFixed(2)}` : '$0.00',
      };
      if (email.trim()) customerData.email = email.trim();
      if (notes.trim()) customerData.notes = notes.trim();
      if (buzzerCode.trim()) customerData.buzzerCode = buzzerCode.trim();

      const newCustomer = await api.createCustomer(customerData);

      Alert.alert('Success', 'Customer created successfully', [
        { text: 'OK', onPress: () => {
          // Pass the new customer back to the previous screen
          navigation.navigate('CreateOrder', { newCustomer });
        }}
      ]);
    } catch (error) {
      console.error('Failed to create customer:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create customer';
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      enableOnAndroid={true}
      extraScrollHeight={Platform.OS === 'ios' ? 20 : 20}
      keyboardShouldPersistTaps="handled"
      enableAutomaticScroll={true}
    >
        {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>New Customer</Text>
          </View>

          {/* Basic Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Customer name"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={(text) => setPhoneNumber(formatPhoneInput(text))}
                  placeholder="(555) 555-5555"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>
          </View>

          {/* Delivery Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Information</Text>
            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Address</Text>
                <AddressInput
                  value={address}
                  onChange={setAddress}
                  placeholder="Delivery address"
                  onFocusApartment={() => {
                    // Scroll down to make apartment field visible
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd(true);
                    }, 100);
                  }}
                />
              </View>
              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Delivery Fee ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryFee}
                    onChangeText={setDeliveryFee}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Buzzer Code</Text>
                  <TextInput
                    style={styles.input}
                    value={buzzerCode}
                    onChangeText={setBuzzerCode}
                    placeholder="Buzzer code"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: '#fff' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Enter each instruction on a new line..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
              scrollEnabled={false}
              blurOnSubmit={false}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd(true);
                }, 300);
              }}
            />
          </View>

          {/* Actions */}
          <View style={styles.actionsSection}>
            <View style={styles.mainActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => navigation.goBack()}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Create Customer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  contentContainer: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#1e293b',
    padding: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionsSection: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  mainActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
