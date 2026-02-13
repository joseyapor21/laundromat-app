// Re-export types from web app for shared types
// Note: In a real monorepo setup, you'd use a shared package
// For now, we'll define the types we need

export type UserRole = 'super_admin' | 'admin' | 'employee' | 'cashier' | 'user';

// Location for multi-location support
export interface Location {
  _id: string;
  name: string;
  code: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  email?: string;
  isActive: boolean;
}

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  name?: string;
  role: UserRole;
  isDriver?: boolean;
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
  | 'in_washer'
  | 'transferred'        // NEW: clothes moved from washer to dryer
  | 'transfer_checked'   // NEW: transfer verified by checker
  | 'in_dryer'
  | 'laid_on_cart'       // Keep for backwards compatibility
  | 'on_cart'            // NEW: preferred status after unloading dryers
  | 'folding'
  | 'folded'
  | 'ready_for_pickup'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type OrderType = 'storePickup' | 'delivery';
export type PaymentMethod = 'cash' | 'credit_card' | 'zelle' | 'credit' | 'pending' | 'venmo' | 'check';
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

export interface Bag {
  identifier: string;
  weight?: number;
  color?: string;
  description?: string;
  isFoldingChecked?: boolean;
  foldingCheckedAt?: Date;
  foldingCheckedBy?: string;
  foldingCheckedByInitials?: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  changedBy: string;
  changedAt: Date;
  notes: string;
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
  deliveryType?: 'full' | 'pickupOnly' | 'deliveryOnly';
  sameDayFee?: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  creditApplied?: number;
  specialInstructions?: string;
  notes?: string;
  isSameDay?: boolean;
  isPaid?: boolean;
  paidAt?: Date;
  paidBy?: string;
  // Price override fields
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
  // Layering check (verification after laid_on_cart before folding)
  layeringCheckedBy?: string;
  layeringCheckedByInitials?: string;
  layeringCheckedAt?: Date;
  // Folding check (verification after folding before ready)
  foldingCheckedBy?: string;
  foldingCheckedByInitials?: string;
  foldingCheckedAt?: Date;
  // Transfer tracking - who moved clothes from washer to dryer
  transferredBy?: string;
  transferredByInitials?: string;
  transferredAt?: Date;
  // Transfer check tracking - verification after transfer
  transferCheckedBy?: string;
  transferCheckedByInitials?: string;
  transferCheckedAt?: Date;
  // Final check tracking - verification before marking ready
  finalCheckedBy?: string;
  finalCheckedByInitials?: string;
  finalCheckedAt?: Date;
  finalWeight?: number;
  dropOffDate: Date;
  scheduledPickupTime?: Date;
  estimatedPickupDate?: Date;
  estimatedReadyDate?: Date;
  deliverySchedule?: Date;
  completedDate?: Date;
  assignedWasher?: string;
  assignedDryer?: string;
  machineAssignments?: MachineAssignment[];
  bags?: Bag[];
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt: Date;
  updatedAt: Date;
  customer?: Customer;
  statusHistory?: StatusHistoryEntry[];
}

export interface Settings {
  _id: string;
  minimumWeight: number;
  minimumPrice: number;
  pricePerPound: number;
  sameDayMinimumCharge?: number;
  sameDayExtraCentsPerPound?: number;
  // Store location for route optimization
  storeAddress?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  // Thermal printer settings
  thermalPrinterIp?: string;
  thermalPrinterPort?: number;
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
  // Weight-based pricing: if set, price applies per X pounds (e.g., 15 = per 15 lbs)
  // Quantity is auto-calculated as ceil(totalWeight / perWeightUnit)
  perWeightUnit?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MachineType = 'washer' | 'dryer';
export type MachineStatus = 'available' | 'in_use' | 'maintenance';

export interface MaintenancePhoto {
  photoPath: string;
  capturedAt: string;
  capturedBy: string;
  capturedByName: string;
}

export interface Machine {
  _id: string;
  name: string;
  type: MachineType;
  qrCode: string;
  status: MachineStatus;
  maintenanceNotes?: string;
  maintenancePhotos?: MaintenancePhoto[];
  currentOrderId?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MachineAssignment {
  machineId: string;
  machineName: string;
  machineType: MachineType;
  assignedAt: Date;
  assignedBy: string;
  removedAt?: Date;
  removedBy?: string;
  isChecked?: boolean;
  checkedAt?: Date;
  checkedBy?: string;
  checkedByInitials?: string;
}

export interface OrderExtraItem {
  item: ExtraItem;
  quantity: number;
  price: number;
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

// Time Clock types
export type TimeEntryType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

export interface TimeEntry {
  _id: string;
  userId: string;
  userName: string;
  userInitials: string;
  type: TimeEntryType;
  timestamp: Date;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
  };
  photoPath?: string;
  deviceInfo?: string;
  notes?: string;
  createdAt: Date;
}

export interface ClockStatus {
  isClockedIn: boolean;
  isOnBreak: boolean;
  lastClockIn?: Date;
  lastClockOut?: Date;
  lastBreakStart?: Date;
  lastBreakEnd?: Date;
  todayEntries: Array<{
    _id: string;
    type: TimeEntryType;
    timestamp: Date;
    location: {
      latitude: number;
      longitude: number;
    };
  }>;
}
