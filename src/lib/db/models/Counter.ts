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
export async function getNextOrderSequence(): Promise<number> {
  const counter = await OrderCounter.findByIdAndUpdate(
    'orderId',
    { $inc: { next: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter!.next;
}

export async function getNextCustomerSequence(): Promise<number> {
  const counter = await CustomerCounter.findByIdAndUpdate(
    'customerId',
    { $inc: { next: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return counter!.next;
}

export { OrderCounter, CustomerCounter };
