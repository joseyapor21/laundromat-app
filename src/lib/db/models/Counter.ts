import mongoose, { Model } from 'mongoose';

interface CounterDoc {
  _id: string;
  sequence_value: number;
  next: number;
}

const counterSchema = new mongoose.Schema<CounterDoc>({
  _id: {
    type: String,
    required: true,
  },
  sequence_value: {
    type: Number,
    default: 0,
  },
  next: {
    type: Number,
    required: true,
    default: 1,
  },
}, {
  collection: 'ordersCounter',
});

const customerCounterSchema = new mongoose.Schema<CounterDoc>({
  _id: {
    type: String,
    required: true,
  },
  sequence_value: {
    type: Number,
    default: 0,
  },
  next: {
    type: Number,
    required: true,
    default: 1,
  },
}, {
  collection: 'customerCounter',
});

const OrderCounter: Model<CounterDoc> = mongoose.models.OrderCounter || mongoose.model<CounterDoc>('OrderCounter', counterSchema);
const CustomerCounter: Model<CounterDoc> = mongoose.models.CustomerCounter || mongoose.model<CounterDoc>('CustomerCounter', customerCounterSchema);

// Helper function to get next sequence number
// If locationId is provided, uses per-location counter; otherwise uses global counter
export async function getNextOrderSequence(locationId?: string): Promise<number> {
  const counterId = locationId ? `orderId_${locationId}` : 'orderId';
  const counter = await OrderCounter.findByIdAndUpdate(
    counterId,
    { $inc: { next: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter!.next;
}

export async function getNextCustomerSequence(locationId?: string): Promise<number> {
  const counterId = locationId ? `customerId_${locationId}` : 'customerId';
  const counter = await CustomerCounter.findByIdAndUpdate(
    counterId,
    { $inc: { next: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter!.next;
}

export { OrderCounter, CustomerCounter };
