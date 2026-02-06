import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';

const MONGODB_URI = 'mongodb://Joseyapor21:J7249656y@192.168.8.254:27017';
const DB_NAME = 'laundromat';
const CSV_PATH = '/Users/joseyapor/Desktop/customers_final.csv';

async function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');

  const customers = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Handle CSV properly (fields might contain commas in quotes)
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const customer = {};
    headers.forEach((header, idx) => {
      customer[header.trim()] = values[idx] || '';
    });

    // Skip if no phone number
    if (customer.phone) {
      customers.push(customer);
    }
  }

  return customers;
}

async function main() {
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const customersCollection = db.collection('customers');

    // Get current max ID
    const maxIdDoc = await customersCollection.findOne({}, { sort: { id: -1 } });
    let nextId = (maxIdDoc?.id || 0) + 1;
    console.log(`Starting ID: ${nextId}`);

    // Get existing phone numbers to avoid duplicates
    const existingCustomers = await customersCollection.find({}, { projection: { phoneNumber: 1 } }).toArray();
    const existingPhones = new Set(existingCustomers.map(c => c.phoneNumber?.replace(/\D/g, '')));
    console.log(`Existing customers: ${existingPhones.size}`);

    // Parse CSV
    const csvCustomers = await parseCSV(CSV_PATH);
    console.log(`CSV customers to import: ${csvCustomers.length}`);

    // Prepare customers for insert
    const toInsert = [];
    let skipped = 0;

    for (const csvCustomer of csvCustomers) {
      const phone = csvCustomer.phone?.replace(/\D/g, '');

      if (!phone) {
        skipped++;
        continue;
      }

      // Check for duplicate
      if (existingPhones.has(phone)) {
        skipped++;
        continue;
      }

      // Add to set to avoid duplicates within CSV
      existingPhones.add(phone);

      toInsert.push({
        id: nextId++,
        name: csvCustomer.name || 'Unknown',
        phoneNumber: phone,
        address: csvCustomer.address || '',
        buzzerCode: '',
        deliveryFee: '$03.00',
        notes: csvCustomer.notes || '',
        credit: 0,
        creditHistory: [],
      });
    }

    console.log(`Customers to insert: ${toInsert.length}`);
    console.log(`Skipped (duplicates/no phone): ${skipped}`);

    if (toInsert.length > 0) {
      const result = await customersCollection.insertMany(toInsert);
      console.log(`Successfully inserted: ${result.insertedCount} customers`);
    } else {
      console.log('No new customers to insert.');
    }

    // Show final count
    const totalCount = await customersCollection.countDocuments();
    console.log(`Total customers in database: ${totalCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Done.');
  }
}

main();
