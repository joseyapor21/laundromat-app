import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

interface DriverLocationMarkerProps {
  coordinate: { latitude: number; longitude: number };
  heading?: number | null;
}

export default function DriverLocationMarker({ coordinate, heading }: DriverLocationMarkerProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulsing animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [pulseAnim]);

  // Calculate rotation for heading arrow
  const rotation = heading != null ? `${heading}deg` : '0deg';

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={true}
    >
      <View style={styles.container}>
        {/* Pulsing outer ring */}
        <Animated.View
          style={[
            styles.pulseRing,
            { transform: [{ scale: pulseAnim }] },
          ]}
        />

        {/* Main marker */}
        <View style={styles.marker}>
          <Ionicons name="car" size={18} color="#fff" />
        </View>

        {/* Heading direction arrow */}
        {heading != null && (
          <View style={[styles.headingArrow, { transform: [{ rotate: rotation }] }]}>
            <View style={styles.arrowHead} />
          </View>
        )}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  headingArrow: {
    position: 'absolute',
    top: -5,
    width: 20,
    height: 20,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ef4444',
  },
});
