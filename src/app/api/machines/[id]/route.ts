import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Machine from '@/lib/db/models/Machine';

// GET /api/machines/[id] - Get a single machine
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const machine = await Machine.findById(id);

    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    return NextResponse.json(machine);
  } catch (error) {
    console.error('Failed to fetch machine:', error);
    return NextResponse.json({ error: 'Failed to fetch machine' }, { status: 500 });
  }
}

// PUT /api/machines/[id] - Update a machine
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const machine = await Machine.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true }
    );

    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    return NextResponse.json(machine);
  } catch (error) {
    console.error('Failed to update machine:', error);
    return NextResponse.json({ error: 'Failed to update machine' }, { status: 500 });
  }
}

// DELETE /api/machines/[id] - Delete a machine
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const machine = await Machine.findByIdAndDelete(id);

    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Machine deleted successfully' });
  } catch (error) {
    console.error('Failed to delete machine:', error);
    return NextResponse.json({ error: 'Failed to delete machine' }, { status: 500 });
  }
}
