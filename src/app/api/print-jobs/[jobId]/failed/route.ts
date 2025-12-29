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
    const { error: errorMessage } = await request.json();

    const job = await PrintJob.findById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Print job not found' },
        { status: 404 }
      );
    }

    job.attempts += 1;
    job.error = errorMessage || 'Unknown error';

    // Check if we should retry
    if (job.attempts < job.maxAttempts) {
      job.status = 'pending';
    } else {
      job.status = 'failed';
    }

    await job.save();

    return NextResponse.json({
      jobId: job._id.toString(),
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      willRetry: job.status === 'pending',
    });
  } catch (error) {
    console.error('Failed print job error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
