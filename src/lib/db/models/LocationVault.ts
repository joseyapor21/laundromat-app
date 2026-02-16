import mongoose, { Model, Types } from 'mongoose';

export type VaultItemType = 'bill' | 'contract' | 'email_account' | 'password' | 'note' | 'document';

export interface VaultDocument {
  fileName: string;
  filePath: string;
  fileType: string;  // 'image/jpeg', 'application/pdf', etc.
  uploadedAt: Date;
  uploadedBy: string;
  uploadedByName: string;
}

export interface LocationVaultItemDoc {
  _id: Types.ObjectId;
  locationId: Types.ObjectId;
  type: VaultItemType;
  title: string;
  description?: string;
  // For bills/contracts
  vendor?: string;
  amount?: number;
  dueDate?: Date;
  // For email accounts
  emailAddress?: string;
  emailPassword?: string;  // Stored encrypted
  smtpServer?: string;
  imapServer?: string;
  // For passwords
  service?: string;
  username?: string;
  password?: string;  // Stored encrypted
  url?: string;
  // For notes
  content?: string;
  // Documents/attachments
  documents?: VaultDocument[];
  // Metadata
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  updatedAt: Date;
  updatedBy?: string;
  updatedByName?: string;
}

const vaultDocumentSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  filePath: { type: String, required: true },
  fileType: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: String, required: true },
  uploadedByName: { type: String, required: true },
});

const locationVaultItemSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['bill', 'contract', 'email_account', 'password', 'note', 'document'],
    required: true,
  },
  title: { type: String, required: true },
  description: { type: String },
  // Bill/contract fields
  vendor: { type: String },
  amount: { type: Number },
  dueDate: { type: Date },
  // Email account fields
  emailAddress: { type: String },
  emailPassword: { type: String },  // Will be encrypted
  smtpServer: { type: String },
  imapServer: { type: String },
  // Password fields
  service: { type: String },
  username: { type: String },
  password: { type: String },  // Will be encrypted
  url: { type: String },
  // Note fields
  content: { type: String },
  // Documents
  documents: [vaultDocumentSchema],
  // Metadata
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, required: true },
  createdByName: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String },
  updatedByName: { type: String },
}, {
  collection: 'location_vault_items',
});

// Compound indexes for efficient queries
locationVaultItemSchema.index({ locationId: 1, type: 1 });
locationVaultItemSchema.index({ locationId: 1, isActive: 1 });

// Update timestamps before save
locationVaultItemSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const LocationVaultItem: Model<LocationVaultItemDoc> =
  mongoose.models.LocationVaultItem ||
  mongoose.model<LocationVaultItemDoc>('LocationVaultItem', locationVaultItemSchema);

export default LocationVaultItem;
