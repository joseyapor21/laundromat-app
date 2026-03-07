import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import MapView, { Region, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Order } from '../../types';
import { GeocodedStop } from '../../hooks/useGeocodedStops';
import { DriverLocation } from '../../hooks/useDriverLocation';
import StopMarker from './StopMarker';
import DriverLocationMarker from './DriverLocationMarker';

interface DeliveryMapProps {
  stops: GeocodedStop[];
  driverLocation: DriverLocation | null;
  isGeocoding: boolean;
  geocodingProgress: { done: number; total: number };
  onStopPress?: (order: Order) => void;
  onNavigate?: (address: string) => void;
}

const DEFAULT_REGION: Region = {
  latitude: 40.7128, // NYC default
  longitude: -74.0060,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export default function DeliveryMap({
  stops,
  driverLocation,
  isGeocoding,
  geocodingProgress,
  onStopPress,
  onNavigate,
}: DeliveryMapProps) {
  const mapRef = useRef<MapView>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  // Fit map to show all markers
  useEffect(() => {
    if (mapRef.current && !isGeocoding) {
      const validStops = stops.filter(s => s.coordinates !== null);
      const coordinates: { latitude: number; longitude: number }[] = validStops.map(s => ({
        latitude: s.coordinates!.lat,
        longitude: s.coordinates!.lng,
      }));

      // Add driver location if available
      if (driverLocation) {
        coordinates.push({
          latitude: driverLocation.latitude,
          longitude: driverLocation.longitude,
        });
      }

      if (coordinates.length > 0) {
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 80, right: 40, bottom: 120, left: 40 },
          animated: true,
        });
      }
    }
  }, [stops, driverLocation, isGeocoding]);

  const handleStopPress = (order: Order) => {
    setSelectedOrder(order);
    onStopPress?.(order);
  };

  const handleNavigatePress = () => {
    if (selectedOrder) {
      const address = selectedOrder.customer?.address || '';
      onNavigate?.(address);
    }
  };

  const centerOnDriver = () => {
    if (mapRef.current && driverLocation) {
      mapRef.current.animateToRegion({
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  };

  const validStops = stops.filter(s => s.coordinates !== null);
  const pickupCount = stops.filter(s => s.type === 'pickup').length;
  const deliveryCount = stops.filter(s => s.type === 'delivery').length;

  return (
    <View style={styles.container}>
      {/* Loading overlay */}
      {isGeocoding && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>
            Loading addresses... {geocodingProgress.done}/{geocodingProgress.total}
          </Text>
        </View>
      )}

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={true}
        rotateEnabled={true}
        pitchEnabled={false}
      >
        {/* Stop markers */}
        {validStops.map((stop, index) => (
          <StopMarker
            key={stop.order._id}
            order={stop.order}
            coordinate={{
              latitude: stop.coordinates!.lat,
              longitude: stop.coordinates!.lng,
            }}
            type={stop.type}
            index={index}
            onPress={handleStopPress}
          />
        ))}

        {/* Driver location marker */}
        {driverLocation && (
          <DriverLocationMarker
            coordinate={{
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            }}
            heading={driverLocation.heading}
          />
        )}
      </MapView>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: '#3b82f6' }]} />
          <Text style={styles.statText}>Pickups: {pickupCount}</Text>
        </View>
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: '#8b5cf6' }]} />
          <Text style={styles.statText}>Deliveries: {deliveryCount}</Text>
        </View>
        <TouchableOpacity style={styles.legendButton} onPress={() => setShowLegend(true)}>
          <Ionicons name="information-circle-outline" size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Center on driver button */}
      {driverLocation && (
        <TouchableOpacity style={styles.centerButton} onPress={centerOnDriver}>
          <Ionicons name="locate" size={24} color="#2563eb" />
        </TouchableOpacity>
      )}

      {/* Selected order sheet */}
      {selectedOrder && (
        <View style={styles.orderSheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.customerName}>{selectedOrder.customer?.name || selectedOrder.customerName || 'Unknown'}</Text>
              <Text style={styles.orderNumber}>#{selectedOrder.orderId}</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedOrder(null)}>
              <Ionicons name="close-circle" size={28} color="#64748b" />
            </TouchableOpacity>
          </View>
          <Text style={styles.address} numberOfLines={2}>
            {selectedOrder.customer?.address || 'No address'}
          </Text>
          {selectedOrder.customer?.notes && (
            <Text style={styles.buzzer}>Notes: {selectedOrder.customer.notes}</Text>
          )}
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.navigateButton} onPress={handleNavigatePress}>
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.navigateText}>Navigate</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Legend modal */}
      <Modal visible={showLegend} transparent animationType="fade">
        <TouchableOpacity
          style={styles.legendOverlay}
          activeOpacity={1}
          onPress={() => setShowLegend(false)}
        >
          <View style={styles.legendContent}>
            <Text style={styles.legendTitle}>Map Legend</Text>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
              <Text style={styles.legendText}>Pickup - New Order</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.legendText}>Pickup - Scheduled</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
              <Text style={styles.legendText}>Pickup - Picked Up</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#8b5cf6' }]} />
              <Text style={styles.legendText}>Delivery - Ready</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.legendText}>Your Location</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  statsBar: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  legendButton: {
    marginLeft: 'auto',
  },
  centerButton: {
    position: 'absolute',
    right: 16,
    bottom: 180,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  orderSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  orderNumber: {
    fontSize: 14,
    color: '#6b7280',
  },
  address: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  buzzer: {
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '500',
    marginBottom: 12,
  },
  sheetActions: {
    flexDirection: 'row',
    marginTop: 12,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
  },
  navigateText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  legendOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 300,
  },
  legendTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  legendText: {
    fontSize: 14,
    color: '#374151',
  },
});
