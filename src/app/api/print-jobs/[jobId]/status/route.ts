import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { PrintJob } from '@/lib/db/models';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { jobId } = await params;

    const job = await PrintJob.findById(jobId).lean();

    if (!job) {
      return NextResponse.json(
        { error: 'Print job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      jobId: job._id.toString(),
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    console.error('Get print job status error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
