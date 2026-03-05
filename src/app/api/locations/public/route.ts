import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Location } from '@/lib/db/models';

// Public endpoint to get active locations (for kiosk mode login)
export async function GET() {
  try {
    await connectDB();

    const locations = await Location.find({ isActive: true })
      .select('_id name code address')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(
      locations.map(loc => ({
        _id: loc._id.toString(),
        name: loc.name,
        code: loc.code,
        address: loc.address,
      }))
    );
  } catch (error) {
    console.error('Get public locations error:', error);
    return NextResponse.json(
      { error: 'Failed to get locations' },
      { status: 500 }
    );
  }
}
