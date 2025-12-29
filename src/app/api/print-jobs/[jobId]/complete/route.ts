import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { PrintJob } from '@/lib/db/models';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { jobId } = await params;

    const job = await PrintJob.findByIdAndUpdate(
      jobId,
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!job) {
      return NextResponse.json(
        { error: 'Print job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      jobId: job._id.toString(),
      status: job.status,
      message: 'Print job completed successfully',
    });
  } catch (error) {
    console.error('Complete print job error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
