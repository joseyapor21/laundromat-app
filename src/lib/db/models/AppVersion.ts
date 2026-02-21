import mongoose, { Schema, Document } from 'mongoose';

export interface IAppVersion extends Document {
  minVersion: string;
  latestVersion: string;
  updateMessage: string;
  forceUpdate: boolean;
  iosIpaPath?: string;
  iosIpaUploadedAt?: Date;
  iosExternalUrl?: string;
  androidApkPath?: string;
  androidApkUploadedAt?: Date;
  androidExternalUrl?: string;
  updatedAt: Date;
  updatedBy: string;
  updatedByName: string;
}

const AppVersionSchema = new Schema<IAppVersion>(
  {
    minVersion: { type: String, required: true, default: '1.0.0' },
    latestVersion: { type: String, required: true, default: '1.0.0' },
    updateMessage: {
      type: String,
      default: 'A new version of the app is available. Please update to continue using the app.'
    },
    forceUpdate: { type: Boolean, default: false },
    iosIpaPath: { type: String },
    iosIpaUploadedAt: { type: Date },
    iosExternalUrl: { type: String },
    androidApkPath: { type: String },
    androidApkUploadedAt: { type: Date },
    androidExternalUrl: { type: String },
    updatedBy: { type: String },
    updatedByName: { type: String },
  },
  {
    timestamps: true,
  }
);

export const AppVersion = mongoose.models.AppVersion || mongoose.model<IAppVersion>('AppVersion', AppVersionSchema);
