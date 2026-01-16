'use client';

import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';

interface AddressSuggestion {
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  components: {
    streetNumber: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

interface AddressInputProps {
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export default function AddressInput({
  value,
  onChange,
  placeholder = 'Enter address...',
  className = '',
  required = false,
}: AddressInputProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset verification status when value changes manually
  useEffect(() => {
    setIsVerified(false);
    setVerificationError(null);
  }, [value]);

  const verifyAddress = async (addressToVerify?: string) => {
    const address = addressToVerify || value;
    if (!address || address.trim().length < 5) {
      setVerificationError('Please enter a complete address');
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);

    try {
      const response = await fetch('/api/address/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (data.verified && data.suggestions?.length > 0) {
        setSuggestions(data.suggestions);
        setShowSuggestions(true);
        if (data.suggestions.length === 1) {
          // Auto-select if only one match
          selectSuggestion(data.suggestions[0]);
        }
      } else {
        setVerificationError(data.error || 'Address not found');
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Verification error:', error);
      setVerificationError('Failed to verify address');
    } finally {
      setIsVerifying(false);
    }
  };

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    onChange(suggestion.formattedAddress, suggestion.latitude, suggestion.longitude);
    setIsVerified(true);
    setShowSuggestions(false);
    setSuggestions([]);
    setVerificationError(null);
    toast.success('Address verified');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsVerified(false);

    // Debounced auto-verify after user stops typing
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Auto-verify after user stops typing (shorter delay for faster feedback)
    if (newValue.length >= 5) {
      debounceRef.current = setTimeout(() => {
        verifyAddress(newValue);
      }, 600);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <textarea
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          required={required}
          className={`w-full px-3 py-2 border-2 rounded-lg text-gray-900 bg-white focus:outline-none min-h-20 pr-24 ${
            isVerified
              ? 'border-green-400 focus:border-green-500'
              : verificationError
                ? 'border-red-300 focus:border-red-500'
                : 'border-gray-200 focus:border-blue-500'
          } ${className}`}
        />

        {/* Verification status and button */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {isVerified && (
            <span className="text-green-600 text-xs flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Verified
            </span>
          )}
          {!isVerified && (
            <button
              type="button"
              onClick={() => verifyAddress()}
              disabled={isVerifying || !value || value.length < 5}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isVerifying ? (
                <>
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Checking...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Verify
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {verificationError && (
        <p className="text-xs text-red-500 mt-1">{verificationError}</p>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2 text-xs text-gray-500 border-b bg-gray-50">
            Select the correct address:
          </div>
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
            >
              <div className="font-medium text-gray-900 text-sm">
                {suggestion.formattedAddress}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {suggestion.displayName}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
