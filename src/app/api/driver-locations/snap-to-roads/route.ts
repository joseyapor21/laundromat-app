import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';

// Snap GPS coordinates to roads using Google Roads API
// Batches requests in chunks of 100 points (API limit)
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { points } = await request.json();
    if (!points || !Array.isArray(points) || points.length === 0) {
      return NextResponse.json({ snappedPoints: [] });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      // No key — return original points unchanged
      return NextResponse.json({ snappedPoints: points });
    }

    const CHUNK_SIZE = 100;
    const snapped: { latitude: number; longitude: number }[] = [];

    for (let i = 0; i < points.length; i += CHUNK_SIZE) {
      const chunk = points.slice(i, i + CHUNK_SIZE);
      const path = chunk.map((p: { latitude: number; longitude: number }) => `${p.latitude},${p.longitude}`).join('|');
      const url = `https://roads.googleapis.com/v1/snapToRoads?path=${path}&interpolate=true&key=${apiKey}`;

      const res = await fetch(url);
      if (!res.ok) {
        // If API fails, fall back to original chunk coordinates
        snapped.push(...chunk);
        continue;
      }

      const data = await res.json();
      if (data.snappedPoints) {
        for (const pt of data.snappedPoints) {
          snapped.push({
            latitude: pt.location.latitude,
            longitude: pt.location.longitude,
          });
        }
      } else {
        snapped.push(...chunk);
      }
    }

    return NextResponse.json({ snappedPoints: snapped });
  } catch (error) {
    console.error('Snap to roads error:', error);
    return NextResponse.json({ error: 'Failed to snap to roads' }, { status: 500 });
  }
}
