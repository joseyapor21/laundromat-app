// User types
export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'employee' | 'driver' | 'cashier' | 'user';

export interface User {
  _id: string;
  email: string;
  password?: string;
  name?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword?: boolean;
  isSuperUser?: boolean;
  isDeptAdmin?: boolean;
  createdAt?: Date;
  createdBy?: string;
}

export interface UserWithoutPassword extends Omit<User, 'password'> {}

// Customer types
export interface CreditTransaction {
  amount: number;
  type: 'add' | 'use';
  description: string;
  orderId?: string;
  addedBy: string;
  createdAt: Date;
}

export interface Customer {
  _id: string;
  id: number;
  name: string;
  phoneNumber: string;
  address: string;
  buzzerCode: string;
  deliveryFee: string;
  notes: string;
  credit: number;
  creditHistory: CreditTransaction[];
}

// Order types
export type OrderStatus =
  | 'new_order'
  | 'received'
  | 'in_washer'
  | 'in_dryer'
  | 'laid_on_cart'
  | 'folding'
  | 'folded'
  | 'ready_for_pickup'
  | 'ready_for_delivery'
  | 'completed'
  | 'scheduled_pickup'
  | 'picked_up';

export type OrderType = 'storePickup' | 'delivery';

export type PaymentMethod = 'cash' | 'check' | 'venmo' | 'zelle';

export interface Service {
  id: string;
  name: string;
  pricingType: string;
  basePrice: number;
  minWeight: number;
  pricePerPound: number;
  description: string;
  isSpecialItem: boolean;
  specialInstructions: string;
  isActive: boolean;
  category: string;
  deliveryOption: string;
  deliveryFee: number;
  minimumDeliveryAmount: number;
}

export interface Bag {
  identifier: string;
  weight: number;
  color: string;
  description: string;
  // Folding check fields - final verification after folding
  isFoldingChecked?: boolean;
  foldingCheckedAt?: Date;
  foldingCheckedBy?: string;
  foldingCheckedByInitials?: string;
}

export interface OrderItem {
  serviceId: string;
  serviceName: string;
  quantity: number;
  pricePerUnit?: number;
  service?: Service;
  bagIdentifier: string;
  notes: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  changedBy: string;
  changedAt: Date;
  notes: string;
}

// Machine assignment tracking
export interface MachineAssignment {
  machineId: string;
  machineName: string;
  machineType: 'washer' | 'dryer';
  assignedAt: Date;
  assignedBy: string;
  assignedByInitials?: string;
  removedAt?: Date;
  removedBy?: string;
  // Checker fields - person who verifies the work is done
  checkedAt?: Date;
  checkedBy?: string;
  checkedByInitials?: string;
  isChecked?: boolean;
}

// Extra item in order format
export interface OrderExtraItem {
  item: ExtraItem;
  quantity: number;
  price: number;
}

export interface Order {
  _id: string;
  id: string;
  orderId: number;
  orderNumber?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  bags: Bag[];
  weight: number;
  dropOffDate: Date;
  estimatedPickupDate: Date;
  scheduledPickupTime?: Date;
  specialInstructions: string;
  status: OrderStatus;
  employeeId: string;
  totalAmount: number;
  orderType: OrderType;
  deliverySchedule?: Date;
  paymentMethod?: PaymentMethod;
  isPaid: boolean;
  statusHistory: StatusHistoryEntry[];
  machineAssignments?: MachineAssignment[];
  // Extra items with quantities
  extraItems?: OrderExtraItem[];
  // Price override fields
  priceOverride?: number;
  priceChangeNote?: string;
  // Same day service
  isSameDay?: boolean;
  sameDayPricePerPound?: number;  // The combined price per pound (regular + same day extra)
  // Folding tracking - who started folding
  foldingStartedBy?: string;
  foldingStartedByInitials?: string;
  foldingStartedAt?: Date;
  // Folding tracking - who finished folding
  foldedBy?: string;
  foldedByInitials?: string;
  foldedAt?: Date;
  // Folding check tracking (verification after folding before ready)
  foldingCheckedBy?: string;
  foldingCheckedByInitials?: string;
  foldingCheckedAt?: Date;
  // Customer reference (populated)
  customer?: Customer;
}

// Settings types
export interface Settings {
  _id: string;
  minimumWeight: number;
  minimumPrice: number;
  pricePerPound: number;
  // Same day service settings
  sameDayMinimumCharge: number;        // Minimum charge for same day service (e.g., $5)
  sameDayExtraCentsPerPound: number;   // Extra cents per pound for same day (e.g., 0.50 = $0.50/lb extra)
  // Store location for route optimization
  storeAddress?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  // Thermal printer settings
  thermalPrinterIp?: string;
  // Gmail integration for payment notifications
  gmailAccessToken?: string;
  gmailRefreshToken?: string;
  gmailTokenExpiry?: Date;
  gmailConnectedAt?: Date;
  gmailConnectedBy?: string;
  updatedAt: Date;
  updatedBy: string;
}

// Extra Item types
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

// Activity Log types
export type ActivityAction =
  | 'login'
  | 'logout'
  | 'create_order'
  | 'update_order'
  | 'delete_order'
  | 'status_change'
  | 'payment_update'
  | 'create_user'
  | 'update_user'
  | 'delete_user'
  | 'create_customer'
  | 'update_customer'
  | 'delete_customer'
  | 'create_extra_item'
  | 'update_extra_item'
  | 'delete_extra_item'
  | 'update_settings'
  | 'price_override'
  | 'assign_washer'
  | 'assign_dryer'
  | 'release_machine';

export type EntityType = 'order' | 'user' | 'customer' | 'extra_item' | 'settings' | 'machine';

export interface ActivityLog {
  _id: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  entityType?: EntityType;
  entityId?: string;
  details: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// Auth types
export interface AuthToken {
  token: string;
  expiresAt: string;
  user: UserWithoutPassword;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// Print Job types
export type PrintJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PrintJob {
  _id: string;
  content: string;
  printerId: string;
  priority: 'normal' | 'high';
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Machine types (washers/dryers)
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
}
