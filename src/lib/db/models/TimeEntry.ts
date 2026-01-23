import mongoose, { Model, Types } from 'mongoose';

export interface TimeEntryDoc {
  _id: Types.ObjectId;
  userId: string;
  userName: string;
  userInitials: string;
  type: 'clock_in' | 'clock_out';
  timestamp: Date;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  };
  photoPath?: string;
  deviceInfo?: string;
  notes?: string;
  createdAt: Date;
}

const timeEntrySchema = new mongoose.Schema<TimeEntryDoc>({
  userId: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  userInitials: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['clock_in', 'clock_out'],
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },
    address: { type: String },
  },
  photoPath: {
    type: String,
    required: false,
  },
  deviceInfo: {
    type: String,
  },
  notes: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'time_entries',
  timestamps: false,
});

// Indexes for efficient querying
timeEntrySchema.index({ userId: 1, timestamp: -1 });
timeEntrySchema.index({ timestamp: -1 });
timeEntrySchema.index({ type: 1, timestamp: -1 });

const TimeEntry: Model<TimeEntryDoc> = mongoose.models.TimeEntry || mongoose.model<TimeEntryDoc>('TimeEntry', timeEntrySchema);

export default TimeEntry;
export type TimeEntryDocument = TimeEntryDoc;
