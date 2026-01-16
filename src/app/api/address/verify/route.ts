import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';

interface CensusMatch {
  matchedAddress: string;
  coordinates: {
    x: number;
    y: number;
  };
  addressComponents: {
    fromAddress: string;
    toAddress: string;
    preQualifier: string;
    preDirection: string;
    preType: string;
    streetName: string;
    suffixType: string;
    suffixDirection: string;
    suffixQualifier: string;
    city: string;
    state: string;
    zip: string;
  };
}

interface CensusResponse {
  result: {
    input: {
      address: {
        address: string;
      };
    };
    addressMatches: CensusMatch[];
  };
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

    // Use US Census Geocoder - free and accurate for US addresses
    const searchUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;

    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Census Geocoder API error:', response.status);
      return NextResponse.json({
        verified: false,
        error: 'Address verification service unavailable',
        suggestions: [],
      });
    }

    const data: CensusResponse = await response.json();
    const matches = data.result?.addressMatches || [];

    if (matches.length === 0) {
      return NextResponse.json({
        verified: false,
        error: 'Address not found. Please enter a valid US address with street number.',
        suggestions: [],
      });
    }

    // Format suggestions from Census results
    const suggestions = matches.map(match => {
      const comp = match.addressComponents;

      // Build street address
      let street = '';
      if (comp.fromAddress) {
        street = comp.fromAddress;
      }
      if (comp.preDirection) {
        street += ` ${comp.preDirection}`;
      }
      if (comp.streetName) {
        street += ` ${comp.streetName}`;
      }
      if (comp.suffixType) {
        street += ` ${comp.suffixType}`;
      }
      if (comp.suffixDirection) {
        street += ` ${comp.suffixDirection}`;
      }
      street = street.trim();

      const formattedAddress = `${street}, ${comp.city}, ${comp.state} ${comp.zip}`;

      return {
        displayName: match.matchedAddress,
        formattedAddress,
        latitude: match.coordinates.y,
        longitude: match.coordinates.x,
        components: {
          streetNumber: comp.fromAddress || '',
          street: comp.streetName || '',
          city: comp.city || '',
          state: comp.state || '',
          zipCode: comp.zip || '',
          country: 'United States',
        },
      };
    });

    return NextResponse.json({
      verified: true,
      bestMatch: suggestions[0],
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
