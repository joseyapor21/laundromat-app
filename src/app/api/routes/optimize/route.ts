import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';

interface Stop {
  address: string;
  orderId?: string;
  customerName?: string;
}

interface OptimizedStop extends Stop {
  originalIndex: number;
  optimizedIndex: number;
}

interface GoogleDirectionsResponse {
  routes: Array<{
    waypoint_order: number[];
    legs: Array<{
      distance: { value: number; text: string };
      duration: { value: number; text: string };
    }>;
  }>;
  status: string;
  error_message?: string;
}

interface GeocodeResponse {
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
  status: string;
}

interface InvalidAddress {
  address: string;
  customerName?: string;
  orderId?: string;
  reason: string;
}

// Validate a single address using Google Geocoding API
async function validateAddress(address: string, apiKey: string): Promise<{ valid: boolean; reason?: string }> {
  if (!address || address.trim().length < 5) {
    return { valid: false, reason: 'Address is too short or empty' };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data: GeocodeResponse = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      return { valid: true };
    } else if (data.status === 'ZERO_RESULTS') {
      return { valid: false, reason: 'Address not found' };
    } else {
      return { valid: false, reason: `Geocoding failed: ${data.status}` };
    }
  } catch (error) {
    return { valid: false, reason: 'Failed to validate address' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { stops, storeAddress } = await request.json();

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 stops are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Maps API key not configured' },
        { status: 500 }
      );
    }

    // Validate all addresses first
    const invalidAddresses: InvalidAddress[] = [];

    // Validate store address if provided
    if (storeAddress) {
      const storeValidation = await validateAddress(storeAddress, apiKey);
      if (!storeValidation.valid) {
        invalidAddresses.push({
          address: storeAddress,
          customerName: 'Store',
          reason: storeValidation.reason || 'Invalid address',
        });
      }
    }

    // Validate all stop addresses
    for (const stop of stops) {
      const validation = await validateAddress(stop.address, apiKey);
      if (!validation.valid) {
        invalidAddresses.push({
          address: stop.address,
          customerName: stop.customerName,
          orderId: stop.orderId,
          reason: validation.reason || 'Invalid address',
        });
      }
    }

    // If any addresses are invalid, return error with details
    if (invalidAddresses.length > 0) {
      return NextResponse.json(
        {
          error: 'Some addresses need to be fixed before optimizing',
          invalidAddresses,
        },
        { status: 400 }
      );
    }

    // Build the waypoints string for Google Directions API
    // Format: optimize:true|address1|address2|...
    const origin = storeAddress || stops[0].address;
    const destination = storeAddress || stops[stops.length - 1].address;

    // If we have a store address, all stops are waypoints
    // Otherwise, first stop is origin, last is destination, middle are waypoints
    let waypoints: string[];
    let stopsToOptimize: Stop[];

    if (storeAddress) {
      // Round trip from store - all delivery addresses are waypoints
      waypoints = stops.map((s: Stop) => s.address);
      stopsToOptimize = stops;
    } else {
      // No store address - optimize between all stops
      waypoints = stops.slice(1, -1).map((s: Stop) => s.address);
      stopsToOptimize = stops.slice(1, -1);
    }

    // Call Google Directions API with waypoint optimization
    const waypointsParam = waypoints.length > 0
      ? `&waypoints=optimize:true|${waypoints.map(w => encodeURIComponent(w)).join('|')}`
      : '';

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}${waypointsParam}&key=${apiKey}`;

    console.log('Route optimization request:', {
      origin,
      destination,
      waypoints,
      stopsCount: stops.length,
    });

    const response = await fetch(url);
    const data: GoogleDirectionsResponse = await response.json();

    console.log('Google Directions API response status:', data.status);

    if (data.status !== 'OK') {
      console.error('Google Directions API error:', data.status, data.error_message);

      // Provide more helpful error messages
      let errorMessage = data.error_message || data.status;
      if (data.status === 'ZERO_RESULTS') {
        errorMessage = 'No route found. Please check that all addresses are valid and can be reached by car.';
      } else if (data.status === 'NOT_FOUND') {
        errorMessage = 'One or more addresses could not be found. Please verify the addresses.';
      } else if (data.status === 'REQUEST_DENIED') {
        errorMessage = 'Google API request denied. Please check that Directions API is enabled.';
      }

      return NextResponse.json(
        {
          error: errorMessage,
          debug: {
            origin,
            destination,
            waypoints,
            googleStatus: data.status,
          }
        },
        { status: 400 }
      );
    }

    if (!data.routes || data.routes.length === 0) {
      return NextResponse.json(
        { error: 'No route found' },
        { status: 400 }
      );
    }

    const route = data.routes[0];
    const waypointOrder = route.waypoint_order || [];

    // Build optimized stops list
    let optimizedStops: OptimizedStop[];

    if (storeAddress) {
      // All stops were waypoints - reorder based on waypoint_order
      optimizedStops = waypointOrder.map((originalIdx, newIdx) => ({
        ...stops[originalIdx],
        originalIndex: originalIdx,
        optimizedIndex: newIdx,
      }));
    } else {
      // First and last stops stay fixed, middle ones are reordered
      optimizedStops = [
        { ...stops[0], originalIndex: 0, optimizedIndex: 0 },
        ...waypointOrder.map((originalIdx, newIdx) => ({
          ...stopsToOptimize[originalIdx],
          originalIndex: originalIdx + 1,
          optimizedIndex: newIdx + 1,
        })),
        { ...stops[stops.length - 1], originalIndex: stops.length - 1, optimizedIndex: waypointOrder.length + 1 },
      ];
    }

    // Calculate total distance and duration
    const totalDistance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const totalDuration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

    return NextResponse.json({
      optimizedStops,
      totalDistance: {
        value: totalDistance,
        text: `${(totalDistance / 1609.34).toFixed(1)} mi`, // Convert meters to miles
      },
      totalDuration: {
        value: totalDuration,
        text: formatDuration(totalDuration),
      },
      legs: route.legs.map(leg => ({
        distance: leg.distance,
        duration: leg.duration,
      })),
    });
  } catch (error) {
    console.error('Route optimization error:', error);
    return NextResponse.json(
      { error: 'An error occurred during route optimization' },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
}
