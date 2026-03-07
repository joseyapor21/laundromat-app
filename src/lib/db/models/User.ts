import mongoose, { Model, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import type { UserRole } from '@/types';

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  password: string;
  pin?: string;  // 4 digit PIN for kiosk mode quick login
  firstName: string;
  lastName: string;
  role: UserRole;
  isDriver: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  createdBy: string;
  pushToken?: string;
  pushTokenPlatform?: 'ios' | 'android';
  pushNotificationsEnabled: boolean;
  isClockedIn: boolean;
  lastClockIn?: Date;
  lastClockOut?: Date;
  isOnBreak: boolean;
  breakType?: 'breakfast' | 'lunch' | null;
  lastBreakStart?: Date;
  lastBreakEnd?: Date;
  currentLocationId?: Types.ObjectId;  // Track which location user is currently working at
  // GPS tracking for drivers
  currentGpsLocation?: {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    updatedAt: Date;
  };
  comparePassword(password: string): Promise<boolean>;
  comparePin(pin: string): Promise<boolean>;
}

const userSchema = new mongoose.Schema<UserDoc>({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  pin: {
    type: String,
    default: null,  // 4-6 digit PIN for kiosk mode, hashed
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'employee', 'cashier'] as UserRole[],
    required: true,
  },
  isDriver: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  mustChangePassword: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
    required: true,
  },
  pushToken: {
    type: String,
    default: null,
  },
  pushTokenPlatform: {
    type: String,
    enum: ['ios', 'android'],
    default: null,
  },
  pushNotificationsEnabled: {
    type: Boolean,
    default: true,
  },
  isClockedIn: {
    type: Boolean,
    default: false,
  },
  lastClockIn: {
    type: Date,
    default: null,
  },
  lastClockOut: {
    type: Date,
    default: null,
  },
  isOnBreak: {
    type: Boolean,
    default: false,
  },
  breakType: {
    type: String,
    enum: ['breakfast', 'lunch', null],
    default: null,
  },
  lastBreakStart: {
    type: Date,
    default: null,
  },
  lastBreakEnd: {
    type: Date,
    default: null,
  },
  currentLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    default: null,
  },
  // GPS tracking for drivers
  currentGpsLocation: {
    type: {
      latitude: Number,
      longitude: Number,
      heading: Number,
      speed: Number,
      accuracy: Number,
      updatedAt: Date,
    },
    default: null,
  },
}, {
  collection: 'users',
  timestamps: false,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

// Compare PIN method
userSchema.methods.comparePin = async function(pin: string): Promise<boolean> {
  if (!this.pin) return false;
  return bcrypt.compare(pin, this.pin);
};

const User: Model<UserDoc> = mongoose.models.User || mongoose.model<UserDoc>('User', userSchema);

export default User;
export type UserDocument = UserDoc;
