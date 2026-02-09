import mongoose, { Model, Types } from 'mongoose';

export interface LocationDoc {
  _id: Types.ObjectId;
  name: string;
  code: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
  createdBy: string;
}

const locationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  address: {
    type: String,
    required: true,
  },
  latitude: {
    type: Number,
    required: true,
  },
  longitude: {
    type: Number,
    required: true,
  },
  phone: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
    required: true,
  },
}, {
  collection: 'locations',
  timestamps: false,
});

const Location: Model<LocationDoc> = mongoose.models.Location || mongoose.model<LocationDoc>('Location', locationSchema);

export default Location;
