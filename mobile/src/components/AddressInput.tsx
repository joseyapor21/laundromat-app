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
  const [baseAddress, setBaseAddress] = useState(''); // Address without apartment
  const [apartment, setApartment] = useState(''); // Apartment/unit number
  const [showApartmentInput, setShowApartmentInput] = useState(false);
  const [modalInputValue, setModalInputValue] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Sync external value changes only when modal is closed
  useEffect(() => {
    if (!showSuggestions) {
      setInputValue(value);
      setModalInputValue(value);
    }
  }, [value, showSuggestions]);

  const verifyAddress = async (addressToVerify?: string, isAutoVerify = false) => {
    const address = addressToVerify || modalInputValue;
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
    let finalAddress = suggestion.formattedAddress;

    // If we have a placeId, fetch full details to get the complete address
    if (suggestion.placeId) {
      setIsVerifying(true);
      try {
        const details = await api.getPlaceDetails(suggestion.placeId);
        if (details.verified && details.bestMatch) {
          finalAddress = details.bestMatch.formattedAddress;
        }
      } catch (error) {
        console.error('Error fetching place details:', error);
      } finally {
        setIsVerifying(false);
      }
    }

    // Save the base address and show apartment input
    setBaseAddress(finalAddress);
    setApartment('');
    setInputValue(finalAddress);
    onChange(finalAddress);
    setIsVerified(true);
    setShowSuggestions(false);
    setSuggestions([]);
    setVerificationError(null);
    setShowApartmentInput(true); // Show apartment field
    Keyboard.dismiss();
  };

  const handleApartmentChange = (apt: string) => {
    setApartment(apt);
    // Combine base address with apartment
    if (apt.trim()) {
      const fullAddress = `${baseAddress}, Apt ${apt.trim()}`;
      setInputValue(fullAddress);
      onChange(fullAddress);
    } else {
      setInputValue(baseAddress);
      onChange(baseAddress);
    }
  };

  const clearAddress = () => {
    setBaseAddress('');
    setApartment('');
    setInputValue('');
    onChange('');
    setIsVerified(false);
    setShowApartmentInput(false);
  };

  const handleChangeText = (text: string) => {
    // Only update modal input value while typing - don't update parent until selection
    setModalInputValue(text);
    setIsVerified(false);

    // Clear previous suggestions when text changes significantly
    if (text.length < 3) {
      setSuggestions([]);
    }

    // Debounced auto-verify
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Auto-verify after user stops typing (shorter delay for faster feedback)
    if (text.length >= 3) {
      debounceRef.current = setTimeout(() => {
        verifyAddress(text, true); // isAutoVerify = true, don't show errors
      }, 500); // Faster response
    }
    // Don't close modal when text is short - keep it open so user can keep typing
  };

  const handleClose = () => {
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  const openModal = () => {
    setModalInputValue(inputValue); // Initialize modal input with current value
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

      {/* Apartment/Unit input - shows after address is verified */}
      {showApartmentInput && isVerified && (
        <View style={styles.apartmentContainer}>
          <View style={styles.apartmentInputWrapper}>
            <Ionicons name="home-outline" size={18} color="#64748b" style={styles.apartmentIcon} />
            <TextInput
              style={styles.apartmentInput}
              value={apartment}
              onChangeText={handleApartmentChange}
              placeholder="Apt, Suite, Unit (optional)"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <TouchableOpacity style={styles.clearButton} onPress={clearAddress}>
            <Ionicons name="close-circle" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
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
          <View style={styles.modalBackdrop}>
            <TouchableOpacity
              style={styles.backdropTouchable}
              activeOpacity={1}
              onPress={handleClose}
            />
            <TouchableOpacity
              style={styles.suggestionsPopup}
              activeOpacity={1}
              onPress={() => {}} // Prevent touches from reaching backdrop
            >
              {/* Search input inside modal */}
              <TouchableOpacity
                style={styles.modalInputContainer}
                activeOpacity={1}
                onPress={() => {}}
              >
                <Ionicons name="search" size={20} color="#64748b" style={styles.searchIcon} />
                <TextInput
                  style={styles.modalInput}
                  value={modalInputValue}
                  onChangeText={handleChangeText}
                  placeholder="Search address..."
                  placeholderTextColor="#94a3b8"
                  autoFocus
                  blurOnSubmit={false}
                />
                {isVerifying && (
                  <ActivityIndicator size="small" color="#2563eb" style={styles.inputLoader} />
                )}
              </TouchableOpacity>

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
                      {modalInputValue.length < 3
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
            </TouchableOpacity>
          </View>
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
  // Apartment input styles
  apartmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  apartmentInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  apartmentIcon: {
    marginRight: 8,
  },
  apartmentInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    paddingVertical: 12,
  },
  clearButton: {
    padding: 8,
    marginTop: 4,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropTouchable: {
    flex: 1,
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
