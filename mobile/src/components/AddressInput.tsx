import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

interface AddressSuggestion {
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

interface AddressInputProps {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
}

export default function AddressInput({
  value,
  onChange,
  placeholder = 'Enter address...',
}: AddressInputProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Reset verification when value changes
  useEffect(() => {
    setIsVerified(false);
    setVerificationError(null);
  }, [value]);

  const verifyAddress = async (addressToVerify?: string, isAutoVerify = false) => {
    const address = addressToVerify || value;
    if (!address || address.trim().length < 5) {
      if (!isAutoVerify) {
        Alert.alert('Error', 'Please enter a complete address');
      }
      return;
    }

    setIsVerifying(true);
    if (!isAutoVerify) {
      setVerificationError(null);
    }

    try {
      const result = await api.verifyAddress(address);

      if (result.verified && result.suggestions?.length > 0) {
        setSuggestions(result.suggestions);
        setShowSuggestions(true);
        setVerificationError(null);
      } else if (!isAutoVerify) {
        // Only show error on manual verify, not auto-verify while typing
        setVerificationError(result.error || 'Address not found');
        Alert.alert('Address Not Found', result.error || 'Please check the address and try again.');
      }
    } catch (error) {
      console.error('Verification error:', error);
      if (!isAutoVerify) {
        setVerificationError('Failed to verify address');
        Alert.alert('Error', 'Failed to verify address. Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    onChange(suggestion.formattedAddress);
    setIsVerified(true);
    setShowSuggestions(false);
    setSuggestions([]);
    setVerificationError(null);
  };

  const handleChangeText = (text: string) => {
    onChange(text);
    setIsVerified(false);

    // Debounced auto-verify
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Auto-verify after user stops typing (shorter delay for faster feedback)
    if (text.length >= 5) {
      debounceRef.current = setTimeout(() => {
        verifyAddress(text, true); // isAutoVerify = true, don't show errors
      }, 600);
    }
  };

  return (
    <View>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            isVerified && styles.inputVerified,
            verificationError && styles.inputError,
          ]}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={2}
        />

        <View style={styles.buttonContainer}>
          {isVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.verifyButton, isVerifying && styles.verifyButtonDisabled]}
              onPress={() => verifyAddress()}
              disabled={isVerifying || !value || value.length < 5}
            >
              {isVerifying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="location" size={14} color="#fff" />
                  <Text style={styles.verifyButtonText}>Verify</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {verificationError && (
        <Text style={styles.errorText}>{verificationError}</Text>
      )}

      {/* Suggestions Modal */}
      <Modal
        visible={showSuggestions}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowSuggestions(false);
        }}
      >
        <TouchableWithoutFeedback onPress={() => {
          Keyboard.dismiss();
          setShowSuggestions(false);
        }}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Address</Text>
                  <TouchableOpacity onPress={() => {
                    Keyboard.dismiss();
                    setShowSuggestions(false);
                  }}>
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={suggestions}
                  keyExtractor={(item, index) => index.toString()}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.suggestionItem}
                      onPress={() => {
                        Keyboard.dismiss();
                        selectSuggestion(item);
                      }}
                    >
                      <Ionicons name="location-outline" size={20} color="#2563eb" />
                      <View style={styles.suggestionText}>
                        <Text style={styles.suggestionMain}>{item.formattedAddress || 'Address'}</Text>
                        {item.displayName && item.displayName !== item.formattedAddress && (
                          <Text style={styles.suggestionSub} numberOfLines={1}>
                            {item.displayName}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    paddingRight: 90,
    fontSize: 16,
    color: '#1e293b',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputVerified: {
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  buttonContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  verifiedText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: 4,
  },
  suggestionSub: {
    fontSize: 12,
    color: '#64748b',
  },
  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
  },
});
