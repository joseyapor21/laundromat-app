import mongoose, { Document, Model } from 'mongoose';
import type { PrintJob as IPrintJob, PrintJobStatus } from '@/types';

export interface PrintJobDocument extends Omit<IPrintJob, '_id'>, Document {}

const printJobSchema = new mongoose.Schema<PrintJobDocument>({
  content: {
    type: String,
    required: true,
  },
  printerId: {
    type: String,
    default: 'main',
  },
  priority: {
    type: String,
    enum: ['normal', 'high'],
    default: 'normal',
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'] as PrintJobStatus[],
    default: 'pending',
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 3,
  },
  error: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
    required: false,
  },
}, {
  collection: 'printJobs',
});

// Index for cleanup of old jobs
printJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24 hours TTL

const PrintJob: Model<PrintJobDocument> = mongoose.models.PrintJob || mongoose.model<PrintJobDocument>('PrintJob', printJobSchema);

export default PrintJob;
