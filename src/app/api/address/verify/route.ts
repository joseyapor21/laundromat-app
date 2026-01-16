import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';

interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
  boundingbox: string[];
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

    const { address } = await request.json();

    if (!address || address.trim().length < 5) {
      return NextResponse.json(
        { error: 'Address too short', verified: false },
        { status: 400 }
      );
    }

    // Use Nominatim (OpenStreetMap) for free geocoding
    // Add delay to respect rate limits (1 request per second)
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(address)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'LaundromaApp/1.0',
      },
    });

    if (!response.ok) {
      console.error('Nominatim API error:', response.status);
      return NextResponse.json({
        verified: false,
        error: 'Address verification service unavailable',
        suggestions: [],
      });
    }

    const results: NominatimResult[] = await response.json();

    if (results.length === 0) {
      return NextResponse.json({
        verified: false,
        error: 'Address not found. Please check the address and try again.',
        suggestions: [],
      });
    }

    // Format suggestions
    const suggestions = results.map(result => {
      const addr = result.address;

      // Build a clean formatted address
      const parts = [];
      if (addr.house_number && addr.road) {
        parts.push(`${addr.house_number} ${addr.road}`);
      } else if (addr.road) {
        parts.push(addr.road);
      }

      const city = addr.city || addr.town || addr.village || addr.suburb;
      if (city) {
        parts.push(city);
      }

      if (addr.state) {
        parts.push(addr.state);
      }

      if (addr.postcode) {
        parts.push(addr.postcode);
      }

      return {
        displayName: result.display_name,
        formattedAddress: parts.join(', '),
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        components: {
          streetNumber: addr.house_number || '',
          street: addr.road || '',
          city: city || '',
          state: addr.state || '',
          zipCode: addr.postcode || '',
          country: addr.country || 'United States',
        },
      };
    });

    // If the first result is a close match, consider it verified
    const bestMatch = suggestions[0];
    const isVerified = results.length > 0;

    return NextResponse.json({
      verified: isVerified,
      bestMatch: isVerified ? bestMatch : null,
      suggestions,
    });
  } catch (error) {
    console.error('Address verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify address', verified: false },
      { status: 500 }
    );
  }
}
