import mongoose, { Model, Types } from 'mongoose';

export interface CreditTransactionDoc {
  amount: number;
  type: 'add' | 'use';
  description: string;
  orderId?: string;
  addedBy: string;
  paymentMethod?: 'cash' | 'check' | 'venmo' | 'zelle';
  balanceBefore?: number;
  balanceAfter?: number;
  createdAt: Date;
}

export interface RecurringScheduleDoc {
  enabled: boolean;
  pickupDays: number[];   // 0=Sun, 1=Mon, ... 6=Sat
  deliveryDays: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  serviceType?: string;   // default service to use
  notes?: string;         // recurring order instructions
  lastGeneratedDate?: Date; // track last date orders were auto-created
}

export interface CustomerDoc {
  _id: Types.ObjectId;
  id: number;
  locationId?: Types.ObjectId;
  name: string;
  phoneNumber: string;
  address: string;
  buzzerCode: string;
  deliveryFee: string;
  notes: string;
  credit: number;
  creditHistory: CreditTransactionDoc[];
  // Payment identifiers for auto-matching
  venmoUsername?: string;
  zelleEmail?: string;
  zellePhone?: string;
  // Recurring order schedule
  recurringSchedule?: RecurringScheduleDoc;
}

const creditTransactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  type: {
    type: String,
    enum: ['add', 'use'],
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  orderId: {
    type: String,
    default: null,
  },
  addedBy: {
    type: String,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'venmo', 'zelle'],
    default: null,
  },
  balanceBefore: {
    type: Number,
    default: null,
  },
  balanceAfter: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const recurringScheduleSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false,
  },
  pickupDays: {
    type: [Number],
    default: [],
  },
  deliveryDays: {
    type: [Number],
    default: [],
  },
  serviceType: {
    type: String,
    default: null,
  },
  notes: {
    type: String,
    default: '',
  },
  lastGeneratedDate: {
    type: Date,
    default: null,
  },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
  },
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
  phoneNumber: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    default: '',
  },
  buzzerCode: {
    type: String,
    default: '',
  },
  deliveryFee: {
    type: String,
    default: '$03.00',
  },
  notes: {
    type: String,
    default: '',
  },
  credit: {
    type: Number,
    default: 0,
  },
  creditHistory: {
    type: [creditTransactionSchema],
    default: [],
  },
  // Payment identifiers for auto-matching
  venmoUsername: {
    type: String,
    default: null,
    sparse: true,
  },
  zelleEmail: {
    type: String,
    default: null,
    sparse: true,
  },
  zellePhone: {
    type: String,
    default: null,
    sparse: true,
  },
  // Recurring order schedule
  recurringSchedule: {
    type: recurringScheduleSchema,
    default: null,
  },
}, {
  collection: 'customers',
  timestamps: false,
});

// Compound unique index: each location can have its own customer ID sequence
customerSchema.index({ locationId: 1, id: 1 }, { unique: true });

const Customer: Model<CustomerDoc> = mongoose.models.Customer || mongoose.model<CustomerDoc>('Customer', customerSchema);

export default Customer;
export type CustomerDocument = CustomerDoc;
