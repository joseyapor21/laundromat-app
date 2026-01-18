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
  Keyboard,
  Platform,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

interface AddressSuggestion {
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  secondaryText?: string;
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
  const [inputValue, setInputValue] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Sync external value changes (but don't reset verification - that's handled in handleChangeText)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const verifyAddress = async (addressToVerify?: string, isAutoVerify = false) => {
    const address = addressToVerify || inputValue;
    if (!address || address.trim().length < 3) {
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
        // Don't dismiss keyboard - let user keep typing
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

  const selectSuggestion = async (suggestion: AddressSuggestion) => {
    // If we have a placeId, fetch full details to get the complete address
    if (suggestion.placeId) {
      setIsVerifying(true);
      try {
        const details = await api.getPlaceDetails(suggestion.placeId);
        if (details.verified && details.bestMatch) {
          const newValue = details.bestMatch.formattedAddress;
          setInputValue(newValue);
          onChange(newValue);
          setIsVerified(true);
        } else {
          // Fall back to the suggestion's formatted address
          setInputValue(suggestion.formattedAddress);
          onChange(suggestion.formattedAddress);
          setIsVerified(true);
        }
      } catch (error) {
        console.error('Error fetching place details:', error);
        // Fall back to the suggestion's formatted address
        setInputValue(suggestion.formattedAddress);
        onChange(suggestion.formattedAddress);
        setIsVerified(true);
      } finally {
        setIsVerifying(false);
      }
    } else {
      const newValue = suggestion.formattedAddress;
      setInputValue(newValue);
      onChange(newValue);
      setIsVerified(true);
    }

    setShowSuggestions(false);
    setSuggestions([]);
    setVerificationError(null);
    Keyboard.dismiss();
  };

  const handleChangeText = (text: string) => {
    setInputValue(text);
    onChange(text);
    setIsVerified(false);
    // Don't hide suggestions while typing - keep them visible

    // Debounced auto-verify
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Auto-verify after user stops typing (shorter delay for faster feedback)
    if (text.length >= 3) {
      debounceRef.current = setTimeout(() => {
        verifyAddress(text, true); // isAutoVerify = true, don't show errors
      }, 500); // Faster response
    } else {
      // Hide suggestions if text is too short
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const handleClose = () => {
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  const openModal = () => {
    setShowSuggestions(true);
    // If there's already text, trigger a search
    if (inputValue.length >= 3) {
      verifyAddress(inputValue, true);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        {/* Tappable display that opens the modal */}
        <TouchableOpacity
          style={[
            styles.input,
            isVerified && styles.inputVerified,
            verificationError && styles.inputError,
          ]}
          onPress={openModal}
          activeOpacity={0.7}
        >
          <Text style={[styles.inputText, !inputValue && styles.placeholderText]}>
            {inputValue || placeholder}
          </Text>
        </TouchableOpacity>

        <View style={styles.buttonContainer}>
          {isVerifying ? (
            <View style={styles.loadingBadge}>
              <ActivityIndicator size="small" color="#2563eb" />
            </View>
          ) : isVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.verifyButton, (!inputValue || inputValue.length < 3) && styles.verifyButtonDisabled]}
              onPress={() => verifyAddress()}
              disabled={isVerifying || !inputValue || inputValue.length < 3}
            >
              <Ionicons name="location" size={14} color="#fff" />
              <Text style={styles.verifyButtonText}>Verify</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {verificationError && (
        <Text style={styles.errorText}>{verificationError}</Text>
      )}

      {/* Suggestions Modal - Opens when tapping address field */}
      <Modal
        visible={showSuggestions}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleClose}
          >
            <View style={styles.suggestionsPopup}>
              {/* Search input inside modal */}
              <View style={styles.modalInputContainer}>
                <Ionicons name="search" size={20} color="#64748b" style={styles.searchIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={inputValue}
                  onChangeText={handleChangeText}
                  placeholder="Search address..."
                  placeholderTextColor="#94a3b8"
                  autoFocus
                />
                {isVerifying && (
                  <ActivityIndicator size="small" color="#2563eb" style={styles.inputLoader} />
                )}
              </View>

              {/* Suggestions list */}
              <ScrollView
                style={styles.suggestionsList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                {suggestions.length > 0 ? (
                  suggestions.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => selectSuggestion(item)}
                    >
                      <Ionicons name="location-outline" size={20} color="#2563eb" />
                      <View style={styles.suggestionText}>
                        <Text style={styles.suggestionMain} numberOfLines={1}>
                          {item.displayName || item.formattedAddress}
                        </Text>
                        {item.secondaryText && (
                          <Text style={styles.suggestionSub} numberOfLines={1}>
                            {item.secondaryText}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="search" size={32} color="#cbd5e1" />
                    <Text style={styles.emptyStateText}>
                      {inputValue.length < 3
                        ? 'Type an address to search'
                        : isVerifying
                          ? 'Searching...'
                          : 'No addresses found'}
                    </Text>
                  </View>
                )}
              </ScrollView>

              {/* Close button */}
              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
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
    minHeight: 80,
    justifyContent: 'flex-start',
  },
  inputText: {
    fontSize: 16,
    color: '#1e293b',
  },
  placeholderText: {
    color: '#94a3b8',
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
  loadingBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
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
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  suggestionsPopup: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingTop: 12,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  modalInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    paddingVertical: 14,
  },
  inputLoader: {
    marginLeft: 8,
  },
  suggestionsList: {
    maxHeight: SCREEN_HEIGHT * 0.4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionText: {
    flex: 1,
  },
  suggestionMain: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
  },
  suggestionSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 8,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    marginTop: 12,
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
