import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recentCallerService, RecentCallerResult, Customer } from '../services/recentCaller';
import { formatPhoneNumber } from '../utils/phoneFormat';

interface RecentCallerPopupProps {
  visible: boolean;
  result: RecentCallerResult | null;
  onDismiss: () => void;
  onViewCustomer: (customer: Customer) => void;
  onCreateCustomer: (phoneNumber: string) => void;
  onCreateOrder: (customer: Customer) => void;
}

export default function RecentCallerPopup({
  visible,
  result,
  onDismiss,
  onViewCustomer,
  onCreateCustomer,
  onCreateOrder,
}: RecentCallerPopupProps) {
  const insets = useSafeAreaInsets();
  const [slideAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible]);

  const handleDismiss = useCallback(() => {
    if (result?.phoneNumber) {
      recentCallerService.dismissPhoneNumber(result.phoneNumber);
    }
    onDismiss();
  }, [result, onDismiss]);

  if (!visible || !result) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [200, 0],
  });

  const { customer, phoneNumber, isNewNumber } = result;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={handleDismiss}
        />
        <Animated.View
          style={[
            styles.container,
            {
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons
                name={customer ? 'person-circle' : 'call'}
                size={28}
                color={customer ? '#10b981' : '#f59e0b'}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {customer ? 'Customer Found' : 'New Phone Number'}
              </Text>
              <Text style={styles.subtitle}>
                {phoneNumber ? formatPhoneNumber(phoneNumber) : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleDismiss}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {customer ? (
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customer.name}</Text>
              {customer.credit !== undefined && customer.credit > 0 && (
                <View style={styles.creditBadge}>
                  <Ionicons name="wallet" size={14} color="#10b981" />
                  <Text style={styles.creditText}>
                    ${customer.credit.toFixed(2)} credit
                  </Text>
                </View>
              )}
              {customer.address && (
                <Text style={styles.customerAddress} numberOfLines={2}>
                  {customer.address}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.newNumberInfo}>
              <Ionicons name="information-circle" size={20} color="#64748b" />
              <Text style={styles.newNumberText}>
                This phone number is not in your customer list. Would you like to create a new customer?
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {customer ? (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.primaryButton]}
                  onPress={() => onCreateOrder(customer)}
                >
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>New Order</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={() => onViewCustomer(customer)}
                >
                  <Ionicons name="eye" size={20} color="#2563eb" />
                  <Text style={styles.secondaryButtonText}>View Profile</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, styles.primaryButton]}
                  onPress={() => phoneNumber && onCreateCustomer(phoneNumber)}
                >
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Create Customer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={handleDismiss}
                >
                  <Text style={styles.secondaryButtonText}>Dismiss</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Hint */}
          <Text style={styles.hint}>
            Phone number detected from clipboard
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  customerInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  customerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  creditText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10b981',
  },
  customerAddress: {
    fontSize: 14,
    color: '#64748b',
  },
  newNumberInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  newNumberText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94a3b8',
  },
});
