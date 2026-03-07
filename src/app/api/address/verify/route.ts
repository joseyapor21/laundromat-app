import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';

interface PlacePrediction {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  types: string[];
}

interface PlaceAutocompleteResponse {
  predictions: PlacePrediction[];
  status: string;
  error_message?: string;
}

interface PlaceDetailsResponse {
  result: {
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    address_components: {
      long_name: string;
      short_name: string;
      types: string[];
    }[];
    name?: string;
  };
  status: string;
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

    const { address, placeId } = await request.json();

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return NextResponse.json({
        verified: false,
        error: 'Address verification service not configured',
        suggestions: [],
      });
    }

    // If placeId provided, get details for that specific place
    if (placeId) {
      const detailsResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=formatted_address,geometry,address_components,name&key=${apiKey}`
      );

      if (!detailsResponse.ok) {
        return NextResponse.json({
          verified: false,
          error: 'Failed to get address details',
          suggestions: [],
        });
      }

      const detailsData: PlaceDetailsResponse = await detailsResponse.json();

      if (detailsData.status !== 'OK' || !detailsData.result) {
        return NextResponse.json({
          verified: false,
          error: 'Address not found',
          suggestions: [],
        });
      }

      const result = detailsData.result;
      const getComponent = (type: string, useShort = false) => {
        const comp = result.address_components?.find(c => c.types.includes(type));
        return useShort ? comp?.short_name || '' : comp?.long_name || '';
      };

      // Get address components
      const streetNumber = getComponent('street_number');
      const subpremise = getComponent('subpremise'); // For hyphenated numbers like "211-10"
      const street = getComponent('route');
      const city = getComponent('locality') || getComponent('sublocality');
      const state = getComponent('administrative_area_level_1', true);
      const zipCode = getComponent('postal_code');
      const country = getComponent('country');

      // Build full street number including subpremise (e.g., "211-10" from "211" + "10")
      let fullStreetNumber = streetNumber;
      if (subpremise && streetNumber) {
        fullStreetNumber = `${streetNumber}-${subpremise}`;
      }

      // Build formatted address preserving hyphenated numbers
      // Use result.name if it looks like a street address (starts with number), otherwise build from components
      let formattedAddress = result.formatted_address;
      if (result.name && /^\d/.test(result.name)) {
        // result.name is the street address like "211-10 73rd Avenue"
        formattedAddress = `${result.name}, ${city}, ${state} ${zipCode}, ${country}`;
      } else if (fullStreetNumber && street) {
        // Rebuild with full street number
        formattedAddress = `${fullStreetNumber} ${street}, ${city}, ${state} ${zipCode}, ${country}`;
      }

      const suggestion = {
        displayName: result.name || formattedAddress,
        formattedAddress,
        latitude: result.geometry?.location?.lat || 0,
        longitude: result.geometry?.location?.lng || 0,
        placeId,
        components: {
          streetNumber: fullStreetNumber,
          street,
          subpremise,
          city,
          state,
          zipCode,
          country,
        },
      };

      return NextResponse.json({
        verified: true,
        isValid: true,
        bestMatch: suggestion,
        suggestions: [suggestion],
      });
    }

    // Otherwise, get autocomplete suggestions
    if (!address || address.trim().length < 3) {
      return NextResponse.json({
        verified: false,
        error: 'Address too short',
        suggestions: [],
      });
    }

    // Use Google Places Autocomplete API
    const autocompleteUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    autocompleteUrl.searchParams.set('input', address);
    autocompleteUrl.searchParams.set('types', 'address');
    autocompleteUrl.searchParams.set('components', 'country:us');
    autocompleteUrl.searchParams.set('key', apiKey);

    const response = await fetch(autocompleteUrl.toString());

    if (!response.ok) {
      console.error('Google Places Autocomplete API error:', response.status);
      return NextResponse.json({
        verified: false,
        error: 'Address search service error',
        suggestions: [],
      });
    }

    const data: PlaceAutocompleteResponse = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places API status:', data.status, data.error_message);
      return NextResponse.json({
        verified: false,
        error: data.error_message || 'Address search failed',
        suggestions: [],
      });
    }

    if (!data.predictions || data.predictions.length === 0) {
      return NextResponse.json({
        verified: false,
        error: 'No addresses found',
        suggestions: [],
      });
    }

    // Convert predictions to suggestions
    const suggestions = data.predictions.map(prediction => ({
      displayName: prediction.structured_formatting.main_text,
      formattedAddress: prediction.description,
      placeId: prediction.place_id,
      secondaryText: prediction.structured_formatting.secondary_text,
      latitude: 0, // Will be fetched when user selects
      longitude: 0,
    }));

    return NextResponse.json({
      verified: true,
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
