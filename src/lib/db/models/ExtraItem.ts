import mongoose, { Document, Model } from 'mongoose';
import type { ExtraItem as IExtraItem } from '@/types';

export interface ExtraItemDocument extends Omit<IExtraItem, '_id'>, Document {}

const extraItemSchema = new mongoose.Schema<ExtraItemDocument>({
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
}, {
  collection: 'extraItems',
  timestamps: true,
});

const ExtraItem: Model<ExtraItemDocument> = mongoose.models.ExtraItem || mongoose.model<ExtraItemDocument>('ExtraItem', extraItemSchema);

export default ExtraItem;
