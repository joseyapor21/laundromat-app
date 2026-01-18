import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
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
    setShowSuggestions(false); // Hide suggestions when typing

    // Debounced auto-verify
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Auto-verify after user stops typing (shorter delay for faster feedback)
    if (text.length >= 5) {
      debounceRef.current = setTimeout(() => {
        verifyAddress(text, true); // isAutoVerify = true, don't show errors
      }, 800);
    }
  };

  return (
    <View style={styles.container}>
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

      {/* Suggestions Dropdown - Not a Modal, so keyboard stays open */}
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <View style={styles.suggestionsHeader}>
            <Text style={styles.suggestionsTitle}>Select Address</Text>
            <TouchableOpacity onPress={() => setShowSuggestions(false)}>
              <Ionicons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => selectSuggestion(item)}
              >
                <Ionicons name="location-outline" size={18} color="#2563eb" />
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionMain}>{item.formattedAddress || 'Address'}</Text>
                  {item.displayName && item.displayName !== item.formattedAddress && (
                    <Text style={styles.suggestionSub} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
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
  suggestionsContainer: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxHeight: 200,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  suggestionsList: {
    maxHeight: 160,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
  },
  suggestionSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
});
