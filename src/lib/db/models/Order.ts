import mongoose, { Model, Types } from 'mongoose';
import type { OrderStatus, OrderType, PaymentMethod } from '@/types';

export interface OrderDoc {
  _id: Types.ObjectId;
  id: string;
  orderId: number;
  orderNumber?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    serviceId?: string;
    serviceName?: string;
    quantity?: number;
    service?: object;
    bagIdentifier?: string;
    notes?: string;
  }>;
  bags: Array<{
    identifier: string;
    weight: number;
    color?: string;
    description?: string;
  }>;
  weight: number;
  dropOffDate: Date;
  estimatedPickupDate: Date;
  scheduledPickupTime?: Date | null;
  specialInstructions: string;
  status: OrderStatus;
  employeeId: string;
  totalAmount: number;
  orderType: OrderType;
  deliverySchedule?: Date | null;
  paymentMethod?: PaymentMethod | null;
  isPaid: boolean;
  statusHistory: Array<{
    status?: string;
    changedBy?: string;
    changedAt?: Date;
    notes?: string;
  }>;
  machineAssignments?: Array<{
    machineId: string;
    machineName: string;
    machineType: 'washer' | 'dryer';
    assignedAt: Date;
    assignedBy: string;
    assignedByInitials?: string;
    removedAt?: Date;
    removedBy?: string;
    // Checker fields
    checkedAt?: Date;
    checkedBy?: string;
    checkedByInitials?: string;
    isChecked?: boolean;
  }>;
}

const serviceSchema = new mongoose.Schema({
  id: String,
  name: String,
  pricingType: String,
  basePrice: Number,
  minWeight: Number,
  pricePerPound: Number,
  description: String,
  isSpecialItem: Boolean,
  specialInstructions: String,
  isActive: Boolean,
  category: String,
  deliveryOption: String,
  deliveryFee: Number,
  minimumDeliveryAmount: Number,
}, { _id: false });

const bagSchema = new mongoose.Schema({
  identifier: {
    type: String,
    required: true,
  },
  weight: {
    type: Number,
    required: true,
    min: 0,
  },
  color: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
}, { _id: false });

const itemSchema = new mongoose.Schema({
  serviceId: String,
  serviceName: String,
  quantity: Number,
  service: serviceSchema,
  bagIdentifier: String,
  notes: String,
}, { _id: false });

const orderSchema = new mongoose.Schema<OrderDoc>({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  orderId: {
    type: Number,
    required: true,
    unique: true,
  },
  orderNumber: {
    type: String,
    required: false,
  },
  customerId: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  customerPhone: {
    type: String,
    required: true,
  },
  items: [itemSchema],
  bags: [bagSchema],
  weight: {
    type: Number,
    default: 0,
  },
  dropOffDate: {
    type: Date,
    default: Date.now,
  },
  estimatedPickupDate: {
    type: Date,
    required: true,
  },
  scheduledPickupTime: {
    type: Date,
    default: null,
  },
  specialInstructions: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: [
      'new_order',
      'received',
      'in_washer',
      'in_dryer',
      'laid_on_cart',
      'folding',
      'ready_for_pickup',
      'ready_for_delivery',
      'completed',
      'scheduled_pickup',
      'picked_up',
    ] as OrderStatus[],
    default: 'new_order',
  },
  employeeId: {
    type: String,
    default: '',
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  orderType: {
    type: String,
    enum: ['storePickup', 'delivery'] as OrderType[],
    required: true,
  },
  deliverySchedule: {
    type: Date,
    default: null,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'venmo', 'zelle'] as PaymentMethod[],
    default: null,
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  statusHistory: [{
    status: String,
    changedBy: String,
    changedAt: Date,
    notes: String,
  }],
  machineAssignments: [{
    machineId: String,
    machineName: String,
    machineType: {
      type: String,
      enum: ['washer', 'dryer'],
    },
    assignedAt: Date,
    assignedBy: String,
    assignedByInitials: String,
    removedAt: Date,
    removedBy: String,
    // Checker fields
    checkedAt: Date,
    checkedBy: String,
    checkedByInitials: String,
    isChecked: {
      type: Boolean,
      default: false,
    },
  }],
}, {
  collection: 'orders',
  timestamps: false,
});

const Order: Model<OrderDoc> = mongoose.models.Order || mongoose.model<OrderDoc>('Order', orderSchema);

export default Order;
export type OrderDocument = OrderDoc;
