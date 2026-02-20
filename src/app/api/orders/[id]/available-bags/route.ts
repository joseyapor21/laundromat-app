import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Order } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get bags that don't have a machine of the specified type assigned yet
// Used for keepSeparated orders to show available bags when scanning a machine
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();
    const { id } = await params;
    const machineType = request.nextUrl.searchParams.get('machineType');

    if (!machineType || (machineType !== 'washer' && machineType !== 'dryer')) {
      return NextResponse.json(
        { error: 'machineType query parameter is required (washer or dryer)' },
        { status: 400 }
      );
    }

    // Find the order
    let order = await Order.findById(id);

    if (!order) {
      order = await Order.findOne({ id });
    }

    if (!order) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) {
        order = await Order.findOne({ orderId: numericId });
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // If not a keepSeparated order, return empty (shouldn't be called)
    if (!order.keepSeparated) {
      return NextResponse.json([]);
    }

    // Get bag identifiers that already have this machine type assigned (and not removed)
    const machineAssignments = order.machineAssignments || [];
    const assignedBagIdentifiers = machineAssignments
      .filter((a: { machineType: string; bagIdentifier?: string; removedAt?: Date }) =>
        a.machineType === machineType && a.bagIdentifier && !a.removedAt
      )
      .map((a: { bagIdentifier?: string }) => a.bagIdentifier);

    // Filter bags to only include those without an assignment for this machine type
    const allBags = order.bags || [];
    const availableBags = allBags.filter(
      (bag: { identifier: string }) => !assignedBagIdentifiers.includes(bag.identifier)
    );

    return NextResponse.json(availableBags);
  } catch (error) {
    console.error('Get available bags error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
