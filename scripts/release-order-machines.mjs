import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;
const ORDER_ID = parseInt(process.argv[2]) || 46;

const MachineSchema = new mongoose.Schema({
  name: String,
  type: String,
  status: String,
  currentOrderId: mongoose.Schema.Types.Mixed,
  locationId: mongoose.Schema.Types.ObjectId,
});

const OrderSchema = new mongoose.Schema({
  orderId: Number,
  status: String,
  customerName: String,
  locationId: mongoose.Schema.Types.ObjectId,
  machineAssignments: [{
    machineId: String,
    machineName: String,
    machineType: String,
    isChecked: Boolean,
    removedAt: Date,
    checkedAt: Date,
    checkedBy: String,
  }],
  statusHistory: [{
    status: String,
    changedBy: String,
    changedAt: Date,
    notes: String,
  }],
});

const Machine = mongoose.model('Machine', MachineSchema);
const Order = mongoose.model('Order', OrderSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const order = await Order.findOne({ orderId: ORDER_ID });
  if (!order) {
    console.log('Order #' + ORDER_ID + ' not found');
    await mongoose.disconnect();
    return;
  }

  console.log('Found Order #' + ORDER_ID + ' - ' + order.customerName + ' (Status: ' + order.status + ')');

  // Find active (unchecked, not removed) assignments
  const activeAssignments = order.machineAssignments?.filter(a => !a.removedAt && !a.isChecked) || [];
  console.log('Active (unchecked) assignments: ' + activeAssignments.length);

  for (const assignment of activeAssignments) {
    console.log('  Releasing: ' + assignment.machineName + ' (' + assignment.machineType + ')');
    
    // Mark as checked
    assignment.isChecked = true;
    assignment.checkedAt = new Date();
    assignment.checkedBy = 'System (Manual Release)';
    
    // Release the machine
    await Machine.findByIdAndUpdate(assignment.machineId, {
      status: 'available',
      currentOrderId: null,
      lastUsedAt: new Date(),
    });
  }

  // Update order status to on_cart
  order.status = 'on_cart';
  order.statusHistory.push({
    status: 'on_cart',
    changedBy: 'System (Manual Release)',
    changedAt: new Date(),
    notes: 'Machines released manually',
  });

  await order.save();
  console.log('Order #' + ORDER_ID + ' updated to on_cart');

  await mongoose.disconnect();
  console.log('Done!');
}

main().catch(console.error);
