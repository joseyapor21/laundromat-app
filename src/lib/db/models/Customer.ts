import mongoose, { Model, Types } from 'mongoose';

export interface CreditTransactionDoc {
  amount: number;
  type: 'add' | 'use';
  description: string;
  orderId?: string;
  addedBy: string;
  createdAt: Date;
}

export interface CustomerDoc {
  _id: Types.ObjectId;
  id: number;
  name: string;
  phoneNumber: string;
  address: string;
  buzzerCode: string;
  deliveryFee: string;
  notes: string;
  credit: number;
  creditHistory: CreditTransactionDoc[];
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true,
    required: true,
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
    required: true,
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
}, {
  collection: 'customers',
  timestamps: false,
});

const Customer: Model<CustomerDoc> = mongoose.models.Customer || mongoose.model<CustomerDoc>('Customer', customerSchema);

export default Customer;
export type CustomerDocument = CustomerDoc;
