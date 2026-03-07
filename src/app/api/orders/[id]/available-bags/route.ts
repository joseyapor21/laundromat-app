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

    // For keepSeparated orders (separate wash / separate all the way),
    // allow the same bag to be assigned to multiple machines of the same type
    // This is needed when splitting a bag (e.g., whites in one washer, colors in another)
    const allBags = order.bags || [];
    const machineAssignments = order.machineAssignments || [];

    // Enrich bags with their current machine assignments
    const bagsWithAssignments = allBags.map((bag: { identifier: string; weight?: number; color?: string }) => {
      // Find all active assignments for this bag
      const assignments = machineAssignments
        .filter((a: { bagIdentifier?: string; removedAt?: Date; isChecked?: boolean }) =>
          a.bagIdentifier === bag.identifier && !a.removedAt
        )
        .map((a: { machineName: string; machineType: string; isChecked?: boolean }) => ({
          machineName: a.machineName,
          machineType: a.machineType,
          isChecked: a.isChecked || false,
        }));

      return {
        ...bag,
        assignedMachines: assignments,
      };
    });

    // Return all bags with their assignments
    return NextResponse.json(bagsWithAssignments);
  } catch (error) {
    console.error('Get available bags error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
