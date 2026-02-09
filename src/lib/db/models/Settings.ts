import mongoose, { Document, Model } from 'mongoose';
import type { Settings as ISettings } from '@/types';

export interface SettingsDocument extends Omit<ISettings, '_id'>, Document {}

const settingsSchema = new mongoose.Schema<SettingsDocument>({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: false,  // Will be required after migration
    index: true,
    unique: true,  // One settings doc per location
  },
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
  // Same day service settings
  sameDayMinimumCharge: {
    type: Number,
    required: false,
    default: 5,  // Minimum $5 charge for same day
  },
  sameDayExtraCentsPerPound: {
    type: Number,
    required: false,
    default: 0.50,  // $0.50 extra per pound for same day
  },
  // Store location for route optimization
  storeAddress: {
    type: String,
    required: false,
    default: '',
  },
  storeLatitude: {
    type: Number,
    required: false,
    default: 40.7128,  // Default NYC
  },
  storeLongitude: {
    type: Number,
    required: false,
    default: -74.0060,  // Default NYC
  },
  // Thermal printer settings
  thermalPrinterIp: {
    type: String,
    required: false,
    default: '',
  },
  // Backup printer for high availability
  backupPrinterIp: {
    type: String,
    required: false,
    default: '',
  },
  // Print retry settings
  printRetryAttempts: {
    type: Number,
    required: false,
    default: 3,
  },
  // Gmail integration for payment notifications
  gmailAccessToken: {
    type: String,
    required: false,
  },
  gmailRefreshToken: {
    type: String,
    required: false,
  },
  gmailTokenExpiry: {
    type: Date,
    required: false,
  },
  gmailConnectedAt: {
    type: Date,
    required: false,
  },
  gmailConnectedBy: {
    type: String,
    required: false,
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
