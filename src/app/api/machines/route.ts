import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Machine from '@/lib/db/models/Machine';

// GET /api/machines - List all machines
export async function GET() {
  try {
    await connectDB();
    const machines = await Machine.find({}).sort({ type: 1, name: 1 });
    return NextResponse.json(machines);
  } catch (error) {
    console.error('Failed to fetch machines:', error);
    return NextResponse.json({ error: 'Failed to fetch machines' }, { status: 500 });
  }
}

// POST /api/machines - Create a new machine
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();

    const { name, type, qrCode } = body;

    if (!name || !type || !qrCode) {
      return NextResponse.json(
        { error: 'Name, type, and qrCode are required' },
        { status: 400 }
      );
    }

    // Check if QR code already exists
    const existingMachine = await Machine.findOne({ qrCode });
    if (existingMachine) {
      return NextResponse.json(
        { error: 'A machine with this QR code already exists' },
        { status: 400 }
      );
    }

    const machine = await Machine.create({
      name,
      type,
      qrCode,
      status: 'available',
      createdAt: new Date(),
    });

    return NextResponse.json(machine, { status: 201 });
  } catch (error) {
    console.error('Failed to create machine:', error);
    return NextResponse.json({ error: 'Failed to create machine' }, { status: 500 });
  }
}
