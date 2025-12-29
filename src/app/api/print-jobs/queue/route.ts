import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { PrintJob } from '@/lib/db/models';
import { getCurrentUser } from '@/lib/auth/server';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    const { content, printerId, priority } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Print content is required' },
        { status: 400 }
      );
    }

    const printJob = new PrintJob({
      content,
      printerId: printerId || 'main',
      priority: priority || 'normal',
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
    });

    await printJob.save();

    return NextResponse.json({
      jobId: printJob._id.toString(),
      status: printJob.status,
      message: 'Print job queued successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Queue print job error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
