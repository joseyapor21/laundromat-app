import mongoose, { Model, Types } from 'mongoose';

export type MachineType = 'washer' | 'dryer';
export type MachineStatus = 'available' | 'in_use' | 'maintenance';

export interface MaintenancePhoto {
  photoPath: string;
  capturedAt: Date;
  capturedBy: string;
  capturedByName: string;
}

export interface MachineDoc {
  _id: Types.ObjectId;
  locationId?: Types.ObjectId;
  name: string;
  type: MachineType;
  qrCode: string;
  status: MachineStatus;
  maintenanceNotes?: string;
  maintenancePhotos?: MaintenancePhoto[];
  currentOrderId?: string;
  lastUsedAt?: Date;
  createdAt: Date;
}

const machineSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: false,  // Will be required after migration
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['washer', 'dryer'],
    required: true,
  },
  qrCode: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['available', 'in_use', 'maintenance'],
    default: 'available',
  },
  maintenanceNotes: {
    type: String,
    default: '',
  },
  maintenancePhotos: [{
    photoPath: String,
    capturedAt: Date,
    capturedBy: String,
    capturedByName: String,
  }],
  currentOrderId: {
    type: String,
    default: null,
  },
  lastUsedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'machines',
  timestamps: false,
});

const Machine: Model<MachineDoc> = mongoose.models.Machine || mongoose.model<MachineDoc>('Machine', machineSchema);

export default Machine;
