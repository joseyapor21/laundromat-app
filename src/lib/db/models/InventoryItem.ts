import mongoose, { Model, Types } from 'mongoose';

export type StockStatus = 'full' | 'good' | 'half' | 'low' | 'out';

export interface InventoryItemDoc {
  _id: Types.ObjectId;
  name: string;
  quantity: number;
  status: StockStatus;
  lowStockThreshold: number;  // Alert when quantity falls below this
  unit?: string;  // e.g., "bottles", "boxes", "gallons"
  category?: string;  // e.g., "Cleaning Supplies", "Detergent", etc.
  notes?: string;
  needsOrder: boolean;
  orderQuantity?: number;  // How many to order
  locationId: Types.ObjectId;
  lastUpdated: Date;
  lastUpdatedBy?: string;
  createdAt: Date;
}

const inventoryItemSchema = new mongoose.Schema<InventoryItemDoc>({
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['full', 'good', 'half', 'low', 'out'],
    default: 'good',
  },
  lowStockThreshold: {
    type: Number,
    default: 2,
  },
  unit: {
    type: String,
    default: 'items',
  },
  category: {
    type: String,
    default: 'General',
  },
  notes: {
    type: String,
    default: null,
  },
  needsOrder: {
    type: Boolean,
    default: false,
  },
  orderQuantity: {
    type: Number,
    default: null,
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  lastUpdatedBy: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'inventory_items',
  timestamps: false,
});

// Index for faster queries
inventoryItemSchema.index({ locationId: 1, name: 1 });
inventoryItemSchema.index({ locationId: 1, status: 1 });
inventoryItemSchema.index({ locationId: 1, needsOrder: 1 });

const InventoryItem: Model<InventoryItemDoc> = mongoose.models.InventoryItem || mongoose.model<InventoryItemDoc>('InventoryItem', inventoryItemSchema);

export default InventoryItem;
