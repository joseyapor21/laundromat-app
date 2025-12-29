import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { ActivityLog } from '@/lib/db/models';
import { getCurrentUser, isSupervisor } from '@/lib/auth/server';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!isSupervisor(currentUser)) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const action = searchParams.get('action');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {};

    if (action && action !== 'all') {
      query.action = action;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    const logs = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .lean();

    if (format === 'csv') {
      // Generate CSV
      const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details', 'IP Address'];
      const rows = logs.map(log => [
        new Date(log.timestamp).toISOString(),
        log.userName,
        log.action,
        log.entityType || '',
        log.entityId || '',
        log.details,
        log.ipAddress || '',
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="activity-logs-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Return JSON
    return NextResponse.json(logs.map(log => ({
      ...log,
      _id: log._id.toString(),
      userId: log.userId.toString(),
    })));
  } catch (error) {
    console.error('Export activity logs error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
