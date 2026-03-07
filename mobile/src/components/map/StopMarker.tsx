import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Order, OrderStatus } from '../../types';

interface StopMarkerProps {
  order: Order;
  coordinate: { latitude: number; longitude: number };
  type: 'pickup' | 'delivery';
  index?: number;
  onPress?: (order: Order) => void;
}

function getMarkerColor(type: 'pickup' | 'delivery', status: OrderStatus): string {
  if (type === 'delivery') {
    return '#8b5cf6'; // Purple for deliveries
  }

  // Pickup colors based on status
  switch (status) {
    case 'new_order':
      return '#3b82f6'; // Blue
    case 'scheduled_pickup':
      return '#f59e0b'; // Orange
    case 'picked_up':
      return '#10b981'; // Green
    default:
      return '#6b7280'; // Gray
  }
}

export default function StopMarker({ order, coordinate, type, index, onPress }: StopMarkerProps) {
  const color = getMarkerColor(type, order.status);
  const customerName = order.customer?.name || 'Unknown';
  const shortName = customerName.split(' ')[0].substring(0, 8);

  return (
    <Marker
      coordinate={coordinate}
      onPress={() => onPress?.(order)}
      tracksViewChanges={false}
    >
      <View style={styles.container}>
        <View style={[styles.marker, { backgroundColor: color }]}>
          {index !== undefined ? (
            <Text style={styles.indexText}>{index + 1}</Text>
          ) : (
            <Text style={styles.typeIcon}>{type === 'pickup' ? 'P' : 'D'}</Text>
          )}
        </View>
        <View style={[styles.labelContainer, { backgroundColor: color }]}>
          <Text style={styles.labelText} numberOfLines={1}>{shortName}</Text>
        </View>
        <View style={[styles.arrow, { borderTopColor: color }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  indexText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  typeIcon: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  labelContainer: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
