import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer, Location } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

// GET /api/customers/search-all - Search customers from other locations
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!currentUser.locationId) {
      return NextResponse.json(
        { error: 'No location assigned' },
        { status: 400 }
      );
    }

    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 }
      );
    }

    // Search customers from OTHER locations (not current location)
    const searchRegex = new RegExp(query, 'i');

    const customers = await Customer.find({
      locationId: { $ne: currentUser.locationId, $exists: true },
      $or: [
        { name: searchRegex },
        { phoneNumber: searchRegex },
      ],
    })
      .limit(20)
      .lean();

    // Get location names for the results
    const locationIds = [...new Set(customers.map(c => c.locationId?.toString()).filter(Boolean))];
    const locations = await Location.find({ _id: { $in: locationIds } }).lean();
    const locationMap = new Map(locations.map(l => [l._id.toString(), l.name]));

    // Add location name to each customer
    const customersWithLocation = customers.map(c => ({
      ...c,
      _id: c._id.toString(),
      locationId: c.locationId?.toString(),
      locationName: c.locationId ? locationMap.get(c.locationId.toString()) || 'Unknown' : 'Unknown',
      credit: c.credit || 0,
    }));

    return NextResponse.json(customersWithLocation);
  } catch (error) {
    console.error('Search customers error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
