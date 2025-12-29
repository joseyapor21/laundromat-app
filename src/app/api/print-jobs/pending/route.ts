import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { PrintJob } from '@/lib/db/models';

// This endpoint is for the print agent to poll for pending jobs
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const printerId = searchParams.get('printerId') || 'main';

    // Find pending jobs for this printer
    const jobs = await PrintJob.find({
      printerId,
      status: 'pending',
    })
      .sort({ priority: -1, createdAt: 1 })
      .limit(10)
      .lean();

    // Mark as processing
    const jobIds = jobs.map(j => j._id);
    if (jobIds.length > 0) {
      await PrintJob.updateMany(
        { _id: { $in: jobIds } },
        { $set: { status: 'processing' } }
      );
    }

    return NextResponse.json(jobs.map(job => ({
      jobId: job._id.toString(),
      content: job.content,
      priority: job.priority,
      attempts: job.attempts,
    })));
  } catch (error) {
    console.error('Get pending print jobs error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
