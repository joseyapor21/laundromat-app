import mongoose, { Document, Model } from 'mongoose';
import type { Settings as ISettings } from '@/types';

export interface SettingsDocument extends Omit<ISettings, '_id'>, Document {}

const settingsSchema = new mongoose.Schema<SettingsDocument>({
  minimumWeight: {
    type: Number,
    required: true,
    default: 8,
  },
  minimumPrice: {
    type: Number,
    required: true,
    default: 8,
  },
  pricePerPound: {
    type: Number,
    required: true,
    default: 1.25,
  },
  printerIP: {
    type: String,
    required: false,
    default: '192.168.1.100',
  },
  printerPort: {
    type: Number,
    required: false,
    default: 9100,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
    required: true,
  },
}, {
  collection: 'settings',
  timestamps: false,
});

const Settings: Model<SettingsDocument> = mongoose.models.Settings || mongoose.model<SettingsDocument>('Settings', settingsSchema);

export default Settings;
