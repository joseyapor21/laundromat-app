import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
const APP_DB_NAME = process.env.APP_DB_NAME || 'laundromat';

async function resetMachines() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: APP_DB_NAME });
    console.log('Connected to database:', APP_DB_NAME);

    const db = mongoose.connection.db;

    // Find store 1 location
    const store1Id = new mongoose.Types.ObjectId('698a50c70e0b495ff489e1ee');

    // Get current machines
    const machines = await db.collection('machines').find({ locationId: store1Id }).toArray();
    console.log('\nCurrent machines for Store 1:', machines.length);

    const washers = machines.filter(m => m.type === 'washer');
    const dryers = machines.filter(m => m.type === 'dryer');

    console.log('  Washers:', washers.length);
    washers.forEach(m => console.log('    -', m.name, '|', m.status));

    console.log('  Dryers:', dryers.length);
    dryers.forEach(m => console.log('    -', m.name, '|', m.status));

    // Ask if they want to delete all machines
    const args = process.argv.slice(2);
    if (args.includes('--delete')) {
      console.log('\nDeleting all machines for Store 1...');
      const result = await db.collection('machines').deleteMany({ locationId: store1Id });
      console.log('Deleted', result.deletedCount, 'machines');
    } else {
      console.log('\nTo delete all machines, run: node scripts/reset-machines.mjs --delete');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

resetMachines();
