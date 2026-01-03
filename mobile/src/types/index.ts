// Re-export types from web app for shared types
// Note: In a real monorepo setup, you'd use a shared package
// For now, we'll define the types we need

export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'employee' | 'driver' | 'cashier' | 'user';

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  name?: string;
  role: UserRole;
  isActive: boolean;
  isSuperUser?: boolean;
  isDeptAdmin?: boolean;
}

export interface Customer {
  _id: string;
  id?: number;
  name: string;
  phoneNumber: string;
  address: string;
  email?: string;
  deliveryFee: string;
  credit?: number;
  creditHistory?: CreditTransaction[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditTransaction {
  amount: number;
  type: 'add' | 'use';
  description: string;
  orderId?: string;
  createdAt: Date;
  createdBy: string;
}

export type OrderStatus =
  | 'new_order'
  | 'scheduled_pickup'
  | 'picked_up'
  | 'received'
  | 'processing'
  | 'ready'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type OrderType = 'in-store' | 'delivery';
export type PaymentMethod = 'cash' | 'credit_card' | 'zelle' | 'credit' | 'pending';
export type PaymentStatus = 'pending' | 'paid' | 'partial';

export interface OrderItem {
  serviceName: string;
  quantity: number;
  pricePerUnit: number;
  weight?: number;
  total: number;
}

export interface ExtraItemUsage {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  _id: string;
  orderId: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  extraItems?: ExtraItemUsage[];
  weight?: number;
  subtotal: number;
  deliveryFee?: number;
  sameDayFee?: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  creditApplied?: number;
  specialInstructions?: string;
  notes?: string;
  isSameDay?: boolean;
  dropOffDate: Date;
  scheduledPickupTime?: Date;
  estimatedReadyDate?: Date;
  completedDate?: Date;
  assignedWasher?: string;
  assignedDryer?: string;
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt: Date;
  updatedAt: Date;
  customer?: Customer;
}

export interface Settings {
  _id: string;
  minimumWeight: number;
  minimumPrice: number;
  pricePerPound: number;
  sameDayMinimumCharge: number;
  sameDayExtraPercentage: number;
  printerIP: string;
  printerPort: number;
  updatedAt: Date;
  updatedBy: string;
}

export interface ExtraItem {
  _id: string;
  name: string;
  description: string;
  price: number;
  isActive: boolean;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MachineType = 'washer' | 'dryer';
export type MachineStatus = 'available' | 'in_use' | 'maintenance';

export interface Machine {
  _id: string;
  name: string;
  type: MachineType;
  qrCode: string;
  status: MachineStatus;
  currentOrderId?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityLog {
  _id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  orderId?: string;
  customerId?: string;
  timestamp: Date;
}
