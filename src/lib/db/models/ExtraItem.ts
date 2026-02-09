import mongoose, { Document, Model } from 'mongoose';
import type { ExtraItem as IExtraItem } from '@/types';

export interface ExtraItemDocument extends Omit<IExtraItem, '_id'>, Document {}

const extraItemSchema = new mongoose.Schema<ExtraItemDocument>({
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
  description: {
    type: String,
    default: '',
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  category: {
    type: String,
    default: 'general',
  },
  // Weight-based pricing: if set, price applies per X pounds (e.g., 15 = per 15 lbs)
  // Quantity is auto-calculated as ceil(totalWeight / perWeightUnit)
  perWeightUnit: {
    type: Number,
    default: null,
  },
}, {
  collection: 'extraItems',
  timestamps: true,
});

const ExtraItem: Model<ExtraItemDocument> = mongoose.models.ExtraItem || mongoose.model<ExtraItemDocument>('ExtraItem', extraItemSchema);

export default ExtraItem;
