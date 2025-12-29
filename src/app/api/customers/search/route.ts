import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Customer } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || '';

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    // Search by name or phone number
    const customers = await Customer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phoneNumber: { $regex: query, $options: 'i' } },
      ],
    })
      .limit(20)
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(customers.map(c => ({
      ...c,
      _id: c._id.toString(),
    })));
  } catch (error) {
    console.error('Search customers error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
