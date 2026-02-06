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
  extraItems?: Array<{
    itemId: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  bags: Array<{
    identifier: string;
    weight: number;
    color?: string;
    description?: string;
    // Folding check fields
    isFoldingChecked?: boolean;
    foldingCheckedAt?: Date;
    foldingCheckedBy?: string;
    foldingCheckedByInitials?: string;
  }>;
  weight: number;
  dropOffDate: Date;
  estimatedPickupDate: Date;
  scheduledPickupTime?: Date | null;
  specialInstructions: string;
  status: OrderStatus;
  employeeId: string;
  totalAmount: number;
  subtotal?: number;
  sameDayFee?: number;
  deliveryFee?: number;
  orderType: OrderType;
  deliverySchedule?: Date | null;
  paymentMethod?: PaymentMethod | null;
  isPaid: boolean;
  paidAt?: Date | null;
  paidBy?: string;
  // Same day service
  isSameDay?: boolean;
  sameDayPricePerPound?: number;
  // Price override
  priceOverride?: number;
  priceChangeNote?: string;
  // Folding tracking - who started folding
  foldingStartedBy?: string;
  foldingStartedByInitials?: string;
  foldingStartedAt?: Date;
  // Folding tracking - who finished folding
  foldedBy?: string;
  foldedByInitials?: string;
  foldedAt?: Date;
  // Layering check tracking (verification after laid_on_cart before folding)
  layeringCheckedBy?: string;
  layeringCheckedByInitials?: string;
  layeringCheckedAt?: Date;
  // Folding check tracking (verification after folding before ready)
  foldingCheckedBy?: string;
  foldingCheckedByInitials?: string;
  foldingCheckedAt?: Date;
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
  // Driver pickup photos
  pickupPhotos?: Array<{
    photoPath: string;
    capturedAt: Date;
    capturedBy: string;
    capturedByName: string;
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
  // Folding check fields
  isFoldingChecked: {
    type: Boolean,
    default: false,
  },
  foldingCheckedAt: {
    type: Date,
    default: null,
  },
  foldingCheckedBy: {
    type: String,
    default: null,
  },
  foldingCheckedByInitials: {
    type: String,
    default: null,
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

const extraItemUsageSchema = new mongoose.Schema({
  itemId: String,
  name: String,
  price: Number,
  quantity: Number,
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
  extraItems: [extraItemUsageSchema],
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
      'folded',
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
  subtotal: {
    type: Number,
    default: 0,
  },
  sameDayFee: {
    type: Number,
    default: 0,
  },
  deliveryFee: {
    type: Number,
    default: 0,
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
    enum: ['cash', 'check', 'venmo', 'zelle', 'pending', 'credit', 'credit_card'],
    default: null,
  },
  isPaid: {
    type: Boolean,
    default: false,
  },
  paidAt: {
    type: Date,
    default: null,
  },
  paidBy: {
    type: String,
    default: null,
  },
  // Same day service
  isSameDay: {
    type: Boolean,
    default: false,
  },
  sameDayPricePerPound: {
    type: Number,
    default: null,
  },
  // Price override
  priceOverride: {
    type: Number,
    default: null,
  },
  priceChangeNote: {
    type: String,
    default: null,
  },
  // Folding tracking - who started folding
  foldingStartedBy: {
    type: String,
    default: null,
  },
  foldingStartedByInitials: {
    type: String,
    default: null,
  },
  foldingStartedAt: {
    type: Date,
    default: null,
  },
  // Folding tracking - who finished folding
  foldedBy: {
    type: String,
    default: null,
  },
  foldedByInitials: {
    type: String,
    default: null,
  },
  foldedAt: {
    type: Date,
    default: null,
  },
  // Layering check tracking - verification after laid_on_cart before folding
  layeringCheckedBy: {
    type: String,
    default: null,
  },
  layeringCheckedByInitials: {
    type: String,
    default: null,
  },
  layeringCheckedAt: {
    type: Date,
    default: null,
  },
  // Folding check tracking - verification after folding before ready
  foldingCheckedBy: {
    type: String,
    default: null,
  },
  foldingCheckedByInitials: {
    type: String,
    default: null,
  },
  foldingCheckedAt: {
    type: Date,
    default: null,
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
  // Driver pickup photos
  pickupPhotos: [{
    photoPath: String,
    capturedAt: Date,
    capturedBy: String,
    capturedByName: String,
  }],
}, {
  collection: 'orders',
  timestamps: false,
});

const Order: Model<OrderDoc> = mongoose.models.Order || mongoose.model<OrderDoc>('Order', orderSchema);

export default Order;
export type OrderDocument = OrderDoc;
