import { useEffect, useState, useRef, useMemo } from 'react';
import * as Location from 'expo-location';
import { Order } from '../types';

export interface GeocodedStop {
  order: Order;
  coordinates: { lat: number; lng: number } | null;
  address: string;
  type: 'pickup' | 'delivery';
}

// Cache geocoded coordinates to avoid re-geocoding
const coordinateCache = new Map<string, { lat: number; lng: number }>();

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  // Check cache first
  const cached = coordinateCache.get(address);
  if (cached) {
    return cached;
  }

  try {
    // Add NY context for better geocoding of Queens-style addresses
    const addressWithContext = address.includes(', NY') ? address : `${address}, NY`;
    const results = await Location.geocodeAsync(addressWithContext);
    if (results.length > 0) {
      const coords = { lat: results[0].latitude, lng: results[0].longitude };
      coordinateCache.set(address, coords);
      return coords;
    }
    return null;
  } catch (error) {
    console.error('Geocoding failed for address:', address, error);
    return null;
  }
}

interface UseGeocodedStopsOptions {
  pickupOrders: Order[];
  deliveryOrders: Order[];
}

/**
 * Hook that geocodes order addresses to coordinates for map display
 * Uses caching to avoid re-geocoding the same addresses
 */
export function useGeocodedStops({ pickupOrders, deliveryOrders }: UseGeocodedStopsOptions) {
  const [stops, setStops] = useState<GeocodedStop[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef(false);

  // Create stable keys for dependency comparison
  const pickupIds = useMemo(() => pickupOrders.map(o => o._id).join(','), [pickupOrders]);
  const deliveryIds = useMemo(() => deliveryOrders.map(o => o._id).join(','), [deliveryOrders]);

  useEffect(() => {
    abortRef.current = false;

    async function geocodeAllStops() {
      const allOrders: { order: Order; type: 'pickup' | 'delivery' }[] = [
        ...pickupOrders.map(order => ({ order, type: 'pickup' as const })),
        ...deliveryOrders.map(order => ({ order, type: 'delivery' as const })),
      ];

      if (allOrders.length === 0) {
        setStops([]);
        return;
      }

      setIsGeocoding(true);
      setGeocodingProgress({ done: 0, total: allOrders.length });

      const geocodedStops: GeocodedStop[] = [];

      for (let i = 0; i < allOrders.length; i++) {
        if (abortRef.current) break;

        const { order, type } = allOrders[i];
        const address = order.customer?.address || '';

        if (!address) {
          geocodedStops.push({
            order,
            coordinates: null,
            address: 'No address',
            type,
          });
        } else {
          const coordinates = await geocodeAddress(address);
          geocodedStops.push({
            order,
            coordinates,
            address,
            type,
          });
        }

        setGeocodingProgress({ done: i + 1, total: allOrders.length });
      }

      if (!abortRef.current) {
        setStops(geocodedStops);
        setIsGeocoding(false);
      }
    }

    geocodeAllStops();

    return () => {
      abortRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupIds, deliveryIds]);

  return {
    stops,
    isGeocoding,
    geocodingProgress,
  };
}

// Utility to clear cache if needed
export function clearGeocodingCache() {
  coordinateCache.clear();
}
