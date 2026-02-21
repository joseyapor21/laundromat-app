import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://Joseyapor21:J7249656y@192.168.8.254:27017/laundromat?authSource=admin';

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
  }],
});

const LocationSchema = new mongoose.Schema({
  name: String,
  code: String,
});

const Machine = mongoose.model('Machine', MachineSchema);
const Order = mongoose.model('Order', OrderSchema);
const Location = mongoose.model('Location', LocationSchema);

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const locations = await Location.find({});
  console.log('\nLocations:');
  locations.forEach(loc => console.log('  ' + loc.code + ': ' + loc._id + ' - ' + loc.name));

  console.log('\n--- Looking for Order #46 ---');
  const order46 = await Order.findOne({ orderId: 46 });
  if (order46) {
    const loc = locations.find(l => l._id.toString() === order46.locationId?.toString());
    console.log('Found Order #46:');
    console.log('  Location: ' + (loc?.name || 'Unknown') + ' (' + (loc?.code || 'N/A') + ')');
    console.log('  Status: ' + order46.status);
    console.log('  Customer: ' + order46.customerName);
    console.log('  Machine Assignments: ' + (order46.machineAssignments?.length || 0));
    order46.machineAssignments?.forEach(a => {
      console.log('    - ' + a.machineName + ' (' + a.machineType + '): checked=' + a.isChecked + ', removed=' + !!a.removedAt);
    });
  } else {
    console.log('Order #46 NOT FOUND in database');
  }

  console.log('\n--- Machines with currentOrderId set ---');
  const machinesInUse = await Machine.find({ 
    $or: [
      { status: 'in_use' },
      { currentOrderId: { $ne: null } }
    ]
  });

  for (const machine of machinesInUse) {
    const loc = locations.find(l => l._id.toString() === machine.locationId?.toString());
    let orderInfo = 'N/A';
    if (machine.currentOrderId) {
      const order = await Order.findById(machine.currentOrderId);
      if (order) {
        orderInfo = 'Order #' + order.orderId + ' (' + order.status + ')';
      } else {
        orderInfo = 'ORPHAN - Order ID ' + machine.currentOrderId + ' NOT FOUND';
      }
    }
    console.log(machine.name + ' (' + (loc?.code || 'N/A') + '): status=' + machine.status + ', order=' + orderInfo);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
