import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI + '/laundromat?authSource=admin';

// Parse the CSV and extract name/address/phone
function parseCSV(csvPath) {
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split('\n');
  const customers = [];

  // Address pattern - matches formats like "73-23", "220-28", "69-47", etc.
  const addressStartPattern = /(\d{2,3}[-\/]\d{1,3}\s)/;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = line.split(',');
    const firstName = (values[0] || '').trim();
    let phone = (values[20] || '').trim();

    // Clean phone - take first number if multiple
    if (phone.includes(':::')) {
      phone = phone.split(':::')[0].trim();
    }

    // Try to extract address from firstName
    const match = firstName.match(addressStartPattern);
    if (match) {
      const addressStart = match.index;
      let namePart = firstName.substring(0, addressStart).trim();
      let addressPart = firstName.substring(addressStart).trim();

      // Skip if no real name
      if (!namePart || namePart.length < 2) continue;

      // Clean up address - remove notes in parentheses at the end
      addressPart = addressPart.replace(/\([^)]*\)\s*$/, '').trim();
      // Remove trailing notes
      addressPart = addressPart.replace(/\s+(Cold Wash|Whites|On|Own|Side Gate|Bottom|Top|Left Door|Right Door|Left|Right|garden|Pet).*$/i, '').trim();

      // Clean up name - remove trailing slashes and spaces
      namePart = namePart.replace(/[\s\/]+$/, '').trim();

      if (namePart && addressPart) {
        customers.push({
          name: namePart,
          address: addressPart,
          phone: phone
        });
      }
    }
  }

  return customers;
}

// Normalize name for matching
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\/\s]+/g, ' ')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(' ')[0]; // Get first name only
}

async function updateCustomers() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!');

  const customersCol = mongoose.connection.db.collection('customers');

  const csvCustomers = parseCSV('./contacts.csv');
  console.log(`Found ${csvCustomers.length} customers with addresses in CSV\n`);

  let updated = 0;
  let notFound = 0;
  let alreadyHasAddress = 0;
  let multipleMatches = 0;

  for (const csvCustomer of csvCustomers) {
    const firstName = normalizeName(csvCustomer.name);
    if (!firstName || firstName.length < 2) continue;

    // Find by name (case insensitive, starts with first name)
    const regex = new RegExp('^' + firstName, 'i');
    const matches = await customersCol.find({ name: regex }).toArray();

    if (matches.length === 0) {
      // Try partial match
      const partialMatches = await customersCol.find({
        name: { $regex: firstName, $options: 'i' }
      }).toArray();

      if (partialMatches.length === 0) {
        notFound++;
        continue;
      }

      if (partialMatches.length > 1) {
        multipleMatches++;
        continue;
      }

      matches.push(partialMatches[0]);
    }

    if (matches.length > 1) {
      // Multiple matches - try to narrow down
      const exactMatch = matches.find(m =>
        normalizeName(m.name) === firstName
      );
      if (exactMatch) {
        matches.length = 0;
        matches.push(exactMatch);
      } else {
        multipleMatches++;
        continue;
      }
    }

    const customer = matches[0];

    // Check if already has address
    if (customer.address && customer.address.trim()) {
      alreadyHasAddress++;
      continue;
    }

    // Update address
    await customersCol.updateOne(
      { _id: customer._id },
      { $set: { address: csvCustomer.address } }
    );
    console.log(`Updated: ${customer.name} -> ${csvCustomer.address}`);
    updated++;
  }

  console.log('\n--- Summary ---');
  console.log(`Updated: ${updated}`);
  console.log(`Already has address: ${alreadyHasAddress}`);
  console.log(`Multiple matches (skipped): ${multipleMatches}`);
  console.log(`Not found in DB: ${notFound}`);

  await mongoose.disconnect();
}

updateCustomers().catch(console.error);
