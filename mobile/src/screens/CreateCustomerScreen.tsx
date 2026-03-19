import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  FlatList,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { api } from '../services/api';
import { Customer } from '../types';
import { formatPhoneInput, unformatPhone } from '../utils/phoneFormat';
import AddressInput from '../components/AddressInput';
import { saveCustomerToContacts } from '../services/contactsSync';
import { useStorePhone } from '../contexts/StorePhoneContext';

type CreateCustomerParams = {
  prefillName?: string;
  prefillPhone?: string;
};

export default function CreateCustomerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: CreateCustomerParams }, 'params'>>();
  const { isStorePhoneMode } = useStorePhone();
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

  // Referral state
  const [referralSearch, setReferralSearch] = useState('');
  const [referralResults, setReferralResults] = useState<Customer[]>([]);
  const [selectedReferrer, setSelectedReferrer] = useState<Customer | null>(null);
  const [searchingReferral, setSearchingReferral] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchReferrer = useCallback((text: string) => {
    setReferralSearch(text);
    setSelectedReferrer(null);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.trim().length < 2) {
      setReferralResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearchingReferral(true);
      try {
        const customers = await api.getCustomers();
        const query = text.trim().toLowerCase();
        const matches = customers.filter((c: Customer) =>
          c.name.toLowerCase().includes(query) ||
          c.phoneNumber.includes(query)
        ).slice(0, 5);
        setReferralResults(matches);
      } catch {
        setReferralResults([]);
      } finally {
        setSearchingReferral(false);
      }
    }, 300);
  }, []);

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

      // Apply referral credits
      if (selectedReferrer && newCustomer._id) {
        try {
          // $10 credit for new customer
          await api.addCustomerCredit(
            newCustomer._id,
            10,
            `Referral bonus - referred by ${selectedReferrer.name}`,
          );
          // $5 credit for referrer
          await api.addCustomerCredit(
            selectedReferrer._id,
            5,
            `Referral bonus - referred ${name.trim()}`,
          );
        } catch (creditError) {
          console.error('Failed to apply referral credits:', creditError);
        }
      }

      // Auto-save new customer to contacts — only on store phones
      if (isStorePhoneMode) {
        saveCustomerToContacts({
          name: customerData.name,
          phoneNumber: customerData.phoneNumber,
          address: customerData.address,
          email: customerData.email,
        }).catch(() => {}); // fire and forget
      }

      const successMsg = selectedReferrer
        ? `Customer created! $10 credit applied. $5 credit added to ${selectedReferrer.name}.`
        : 'Customer created successfully';

      Alert.alert('Success', successMsg, [
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

          {/* Referral */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Referred By (Optional)</Text>
            <View style={styles.card}>
              {selectedReferrer ? (
                <View style={styles.referrerSelected}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.referrerName}>{selectedReferrer.name}</Text>
                    <Text style={styles.referrerPhone}>{selectedReferrer.phoneNumber}</Text>
                    <Text style={styles.referralInfo}>New customer gets $10 off, {selectedReferrer.name} gets $5 off</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedReferrer(null); setReferralSearch(''); }}>
                    <Ionicons name="close-circle" size={24} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.inputGroup}>
                    <TextInput
                      style={styles.input}
                      value={referralSearch}
                      onChangeText={searchReferrer}
                      placeholder="Search existing customer name or phone..."
                      placeholderTextColor="#94a3b8"
                    />
                    {searchingReferral && (
                      <ActivityIndicator size="small" color="#2563eb" style={{ position: 'absolute', right: 12, top: 12 }} />
                    )}
                  </View>
                  {referralResults.length > 0 && (
                    <View style={styles.referralResults}>
                      {referralResults.map((c) => (
                        <TouchableOpacity
                          key={c._id}
                          style={styles.referralResultItem}
                          onPress={() => {
                            setSelectedReferrer(c);
                            setReferralSearch(c.name);
                            setReferralResults([]);
                          }}
                        >
                          <Text style={styles.referralResultName}>{c.name}</Text>
                          <Text style={styles.referralResultPhone}>{c.phoneNumber}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
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
              autoCorrect={true}
              spellCheck={true}
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
  referrerSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  referrerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  referrerPhone: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  referralInfo: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 4,
    fontWeight: '500',
  },
  referralResults: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 4,
  },
  referralResultItem: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  referralResultName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
  },
  referralResultPhone: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
});
