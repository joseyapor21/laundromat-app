// Migration script for multi-location support
// Run with: node scripts/migrate-to-multi-location.mjs
// Or with custom URI: node scripts/migrate-to-multi-location.mjs "mongodb://user:pass@host:port/db"

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// Allow passing MongoDB URI as command line argument
const customUri = process.argv[2];
const MONGODB_URI = customUri || process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: No MongoDB URI provided. Set MONGODB_URI env var or pass as argument.');
  process.exit(1);
}

console.log(`Using database: ${MONGODB_URI.replace(/:[^:@]+@/, ':****@')}`);

async function migrate() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Step 1: Get existing settings to create default location
    console.log('Step 1: Reading existing settings...');
    const existingSettings = await db.collection('settings').findOne();

    const defaultLocationData = {
      name: 'Main Store',
      code: 'MAIN',
      address: existingSettings?.storeAddress || '123 Main Street',
      latitude: existingSettings?.storeLatitude || 40.7128,
      longitude: existingSettings?.storeLongitude || -74.0060,
      phone: '',
      email: '',
      isActive: true,
      createdAt: new Date(),
      createdBy: 'migration',
    };

    console.log(`  Default location: ${defaultLocationData.name} (${defaultLocationData.code})`);
    console.log(`  Address: ${defaultLocationData.address}\n`);

    // Step 2: Check if location already exists
    console.log('Step 2: Creating default location...');
    let location = await db.collection('locations').findOne({ code: 'MAIN' });

    if (location) {
      console.log('  Default location already exists, skipping creation.\n');
    } else {
      const result = await db.collection('locations').insertOne(defaultLocationData);
      location = { _id: result.insertedId, ...defaultLocationData };
      console.log(`  Created location with ID: ${location._id}\n`);
    }

    const locationId = location._id;

    // Step 3: Update all collections with locationId
    console.log('Step 3: Updating documents with locationId...\n');

    const collections = [
      { name: 'orders', collection: 'orders' },
      { name: 'customers', collection: 'customers' },
      { name: 'machines', collection: 'machines' },
      { name: 'extraItems', collection: 'extraItems' },
      { name: 'time_entries', collection: 'time_entries' },
    ];

    for (const { name, collection } of collections) {
      try {
        const result = await db.collection(collection).updateMany(
          { locationId: { $exists: false } },
          { $set: { locationId: locationId } }
        );
        console.log(`  ${name}: Updated ${result.modifiedCount} documents`);
      } catch (err) {
        console.log(`  ${name}: Collection may not exist or error - ${err.message}`);
      }
    }

    // Step 4: Update settings with locationId
    console.log('\nStep 4: Updating settings...');
    const settingsResult = await db.collection('settings').updateMany(
      { locationId: { $exists: false } },
      { $set: { locationId: locationId } }
    );
    console.log(`  Updated ${settingsResult.modifiedCount} settings documents`);

    // Step 5: Migrate counter sequences to per-location
    console.log('\nStep 5: Migrating counter sequences...');

    // Get current order counter value
    const orderCounter = await db.collection('ordersCounter').findOne({ _id: 'orderId' });
    if (orderCounter) {
      const newCounterId = `orderId_${locationId.toString()}`;
      const exists = await db.collection('ordersCounter').findOne({ _id: newCounterId });
      if (!exists) {
        await db.collection('ordersCounter').insertOne({
          _id: newCounterId,
          sequence_value: orderCounter.sequence_value || 0,
          next: orderCounter.next || 1,
        });
        console.log(`  Created order counter: ${newCounterId} with next=${orderCounter.next}`);
      } else {
        console.log(`  Order counter already exists: ${newCounterId}`);
      }
    } else {
      console.log('  No existing order counter found');
    }

    // Get current customer counter value
    const customerCounter = await db.collection('customerCounter').findOne({ _id: 'customerId' });
    if (customerCounter) {
      const newCounterId = `customerId_${locationId.toString()}`;
      const exists = await db.collection('customerCounter').findOne({ _id: newCounterId });
      if (!exists) {
        await db.collection('customerCounter').insertOne({
          _id: newCounterId,
          sequence_value: customerCounter.sequence_value || 0,
          next: customerCounter.next || 1,
        });
        console.log(`  Created customer counter: ${newCounterId} with next=${customerCounter.next}`);
      } else {
        console.log(`  Customer counter already exists: ${newCounterId}`);
      }
    } else {
      console.log('  No existing customer counter found');
    }

    // Step 6: Create indexes
    console.log('\nStep 6: Creating indexes...');

    for (const { name, collection } of collections) {
      try {
        await db.collection(collection).createIndex({ locationId: 1 });
        console.log(`  Created index on ${name}.locationId`);
      } catch (err) {
        console.log(`  Index on ${name}.locationId may already exist`);
      }
    }

    // Create compound indexes for common queries
    try {
      await db.collection('orders').createIndex({ locationId: 1, status: 1 });
      console.log('  Created compound index on orders (locationId, status)');
    } catch (err) {
      console.log('  Compound index may already exist');
    }

    try {
      await db.collection('customers').createIndex({ locationId: 1, name: 1 });
      console.log('  Created compound index on customers (locationId, name)');
    } catch (err) {
      console.log('  Compound index may already exist');
    }

    console.log('\n========================================');
    console.log('Migration completed successfully!');
    console.log('========================================');
    console.log(`\nDefault location created:`);
    console.log(`  ID: ${locationId}`);
    console.log(`  Name: ${location.name}`);
    console.log(`  Code: ${location.code}`);
    console.log(`\nNext steps:`);
    console.log('1. Update the API routes to filter by locationId');
    console.log('2. Add location selection to the mobile app');
    console.log('3. Create additional locations as needed via /api/locations');

  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

migrate();
