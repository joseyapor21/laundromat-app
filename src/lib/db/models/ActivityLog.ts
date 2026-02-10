import mongoose, { Document, Model } from 'mongoose';
import type { ActivityLog as IActivityLog, ActivityAction, EntityType } from '@/types';

export interface ActivityLogDocument extends Omit<IActivityLog, '_id'>, Document {}

const activityLogSchema = new mongoose.Schema<ActivityLogDocument>({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: false,
  },
  userId: {
    type: String,
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
    enum: [
      'login', 'logout', 'create_order', 'update_order', 'delete_order',
      'status_change', 'payment_update', 'create_user', 'update_user',
      'delete_user', 'create_customer', 'update_customer', 'delete_customer',
      'create_extra_item', 'update_extra_item', 'delete_extra_item',
      'update_settings', 'price_override',
      'assign_washer', 'assign_dryer', 'release_machine',
      'clock_in', 'clock_out', 'break_start', 'break_end',
    ] as ActivityAction[],
  },
  entityType: {
    type: String,
    enum: ['order', 'user', 'customer', 'extra_item', 'settings', 'machine', 'time_entry'] as EntityType[],
    required: false,
  },
  entityId: {
    type: String,
    required: false,
  },
  details: {
    type: String,
    required: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
  },
  ipAddress: {
    type: String,
    required: false,
  },
  userAgent: {
    type: String,
    required: false,
  },
}, {
  timestamps: { createdAt: 'timestamp', updatedAt: false },
});

// Indexes for efficient queries
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ locationId: 1, timestamp: -1 });

const ActivityLog: Model<ActivityLogDocument> = mongoose.models.ActivityLog || mongoose.model<ActivityLogDocument>('ActivityLog', activityLogSchema);

export default ActivityLog;
