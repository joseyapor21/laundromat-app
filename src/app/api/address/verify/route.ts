import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';

interface GoogleAddressComponent {
  componentName: {
    text: string;
    languageCode: string;
  };
  componentType: string;
  confirmationLevel: string;
}

interface GoogleValidationResult {
  result: {
    verdict: {
      inputGranularity: string;
      validationGranularity: string;
      geocodeGranularity: string;
      addressComplete: boolean;
      hasUnconfirmedComponents: boolean;
      hasInferredComponents: boolean;
      hasReplacedComponents: boolean;
    };
    address: {
      formattedAddress: string;
      postalAddress: {
        regionCode: string;
        languageCode: string;
        postalCode: string;
        administrativeArea: string;
        locality: string;
        addressLines: string[];
      };
      addressComponents: GoogleAddressComponent[];
    };
    geocode: {
      location: {
        latitude: number;
        longitude: number;
      };
      plusCode: {
        globalCode: string;
      };
    };
    uspsData?: {
      standardizedAddress: {
        firstAddressLine: string;
        cityStateZipAddressLine: string;
        city: string;
        state: string;
        zipCode: string;
        zipCodeExtension: string;
      };
      deliveryPointCode: string;
      deliveryPointCheckDigit: string;
      dpvConfirmation: string;
      dpvFootnote: string;
      dpvCmra: string;
      dpvVacant: string;
      dpvNoStat: string;
      carrierRoute: string;
      carrierRouteIndicator: string;
      postOfficeCity: string;
      postOfficeState: string;
      fipsCountyCode: string;
      county: string;
      elotNumber: string;
      elotFlag: string;
      addressRecordType: string;
    };
  };
  responseId: string;
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

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return NextResponse.json({
        verified: false,
        error: 'Address verification service not configured',
        suggestions: [],
      });
    }

    // Use Google Address Validation API
    const response = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: {
            regionCode: 'US',
            addressLines: [address],
          },
          enableUspsCass: true, // Enable USPS validation for US addresses
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Google Address Validation API error:', response.status, errorData);
      return NextResponse.json({
        verified: false,
        error: 'Address verification service error',
        suggestions: [],
      });
    }

    const data: GoogleValidationResult = await response.json();
    const result = data.result;

    if (!result?.address?.formattedAddress) {
      return NextResponse.json({
        verified: false,
        error: 'Address not found. Please check and try again.',
        suggestions: [],
      });
    }

    // Extract address components
    const components = result.address.addressComponents || [];
    const getComponent = (type: string) => {
      const comp = components.find(c => c.componentType === type);
      return comp?.componentName?.text || '';
    };

    // Get USPS standardized address if available (most accurate for US)
    let formattedAddress = result.address.formattedAddress;
    const usps = result.uspsData?.standardizedAddress;
    if (usps) {
      formattedAddress = `${usps.firstAddressLine}, ${usps.city}, ${usps.state} ${usps.zipCode}`;
      if (usps.zipCodeExtension) {
        formattedAddress = formattedAddress.replace(usps.zipCode, `${usps.zipCode}-${usps.zipCodeExtension}`);
      }
    }

    const suggestion = {
      displayName: result.address.formattedAddress,
      formattedAddress,
      latitude: result.geocode?.location?.latitude || 0,
      longitude: result.geocode?.location?.longitude || 0,
      components: {
        streetNumber: getComponent('street_number'),
        street: getComponent('route'),
        city: usps?.city || getComponent('locality'),
        state: usps?.state || getComponent('administrative_area_level_1'),
        zipCode: usps?.zipCode || getComponent('postal_code'),
        country: getComponent('country') || 'United States',
      },
      // Additional quality info
      isComplete: result.verdict?.addressComplete || false,
      hasUnconfirmedComponents: result.verdict?.hasUnconfirmedComponents || false,
      dpvConfirmation: result.uspsData?.dpvConfirmation || '', // Y=confirmed, N=not confirmed, S=secondary address, D=vacant
    };

    // Check address quality
    const isValid = result.verdict?.addressComplete &&
                    !result.verdict?.hasUnconfirmedComponents &&
                    result.uspsData?.dpvConfirmation === 'Y';

    return NextResponse.json({
      verified: true,
      isValid,
      bestMatch: suggestion,
      suggestions: [suggestion],
      verdict: result.verdict,
    });
  } catch (error) {
    console.error('Address verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify address', verified: false },
      { status: 500 }
    );
  }
}
