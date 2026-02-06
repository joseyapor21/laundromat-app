#!/usr/bin/env node

/**
 * Clear database for production
 * Deletes all orders, customers, time entries, and activity logs
 * Resets counters to start fresh
 */

import mongoose from 'mongoose';

// Get MongoDB URI from environment or use default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const APP_DB_NAME = process.env.APP_DB_NAME || 'laundromat';

// Check for --force flag
const forceFlag = process.argv.includes('--force');

async function clearDatabase() {
  console.log('\n⚠️  DATABASE CLEANUP FOR PRODUCTION ⚠️\n');
  console.log('This will DELETE ALL:');
  console.log('  - Orders');
  console.log('  - Customers');
  console.log('  - Time Entries (clock in/out records)');
  console.log('  - Activity Logs');
  console.log('  - Print Jobs');
  console.log('  - Reset order/customer counters\n');

  if (!forceFlag) {
    console.log('Run with --force flag to execute the cleanup.');
    console.log('Example: node scripts/clear-database.mjs --force');
    process.exit(0);
  }

  console.log('--force flag detected. Proceeding with cleanup...\n');

  console.log('\nConnecting to database...');

  try {
    await mongoose.connect(`${MONGODB_URI}/${APP_DB_NAME}?authSource=admin`);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Delete orders
    const ordersResult = await db.collection('orders').deleteMany({});
    console.log(`✓ Deleted ${ordersResult.deletedCount} orders`);

    // Delete customers
    const customersResult = await db.collection('customers').deleteMany({});
    console.log(`✓ Deleted ${customersResult.deletedCount} customers`);

    // Delete time entries
    const timeEntriesResult = await db.collection('timeentries').deleteMany({});
    console.log(`✓ Deleted ${timeEntriesResult.deletedCount} time entries`);

    // Delete activity logs
    const activityLogsResult = await db.collection('activitylogs').deleteMany({});
    console.log(`✓ Deleted ${activityLogsResult.deletedCount} activity logs`);

    // Delete print jobs
    const printJobsResult = await db.collection('printjobs').deleteMany({});
    console.log(`✓ Deleted ${printJobsResult.deletedCount} print jobs`);

    // Reset counters
    await db.collection('counters').updateOne(
      { _id: 'order' },
      { $set: { sequence: 0 } }
    );
    console.log('✓ Reset order counter to 0');

    await db.collection('counters').updateOne(
      { _id: 'customer' },
      { $set: { sequence: 0 } }
    );
    console.log('✓ Reset customer counter to 0');

    // Reset user clock-in status
    await db.collection('users').updateMany(
      {},
      {
        $set: {
          isClockedIn: false,
          isOnBreak: false
        },
        $unset: {
          lastClockIn: '',
          lastClockOut: '',
          lastBreakStart: '',
          lastBreakEnd: ''
        }
      }
    );
    console.log('✓ Reset all users clock-in status');

    console.log('\n✅ Database cleared successfully for production!\n');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

clearDatabase();
