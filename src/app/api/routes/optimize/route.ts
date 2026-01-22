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

    const response = await fetch(url);
    const data: GoogleDirectionsResponse = await response.json();

    if (data.status !== 'OK') {
      console.error('Google Directions API error:', data.status, data.error_message);
      return NextResponse.json(
        { error: `Route optimization failed: ${data.error_message || data.status}` },
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
