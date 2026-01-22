// Script to import and compare contacts from Google Contacts CSV exports
// Run with: node scripts/import-contacts.mjs
// Options:
//   --dry-run    Only show what would be imported (default)
//   --import     Actually import new customers
//   --update     Update existing customers with missing data

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const MONGODB_BASE_URI = process.env.MONGODB_URI;
const APP_DB_NAME = process.env.APP_DB_NAME || 'laundromat';
const MONGODB_URI = `${MONGODB_BASE_URI}/${APP_DB_NAME}?authSource=admin`;

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--import') && !args.includes('--update');
const DO_IMPORT = args.includes('--import');
const DO_UPDATE = args.includes('--update');

if (!MONGODB_BASE_URI) {
  console.error('Error: No MongoDB URI. Set MONGODB_URI in .env.local');
  process.exit(1);
}

// CSV file paths
const CSV_FILES = [
  '/Users/joseyapor/Downloads/contacts (2).csv',
  '/Users/joseyapor/Downloads/contacts (1) (1).csv',
  '/Users/joseyapor/Downloads/contacts.csv',
];

// Customer schema
const customerSchema = new mongoose.Schema({
  id: { type: Number, unique: true, required: true },
  name: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  address: { type: String, default: '' },
  buzzerCode: { type: String, default: '' },
  deliveryFee: { type: String, default: '$3.00' },
  notes: { type: String, default: '' },
  credit: { type: Number, default: 0 },
  creditHistory: { type: Array, default: [] },
}, { collection: 'customers' });

const Customer = mongoose.model('Customer', customerSchema);

// Normalize phone number to digits only
function normalizePhone(phone) {
  if (!phone) return '';
  // Handle multiple phone numbers separated by " ::: "
  const firstPhone = phone.split(' ::: ')[0];
  // Remove all non-digits
  const digits = firstPhone.replace(/\D/g, '');
  // Remove leading 1 if 11 digits (US country code)
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

// Format phone as (XXX) XXX-XXXX
function formatPhone(digits) {
  if (digits.length !== 10) return digits;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Check if string looks like a real name (not an address or code)
function looksLikeName(str) {
  if (!str || str.length < 2) return false;

  // Pure numbers or apartment codes like "1a", "20j", "5d"
  if (/^[\d]+[a-z]?$/i.test(str)) return false;

  // Apartment code + word (like "1a Bloom", "3g Jasica", "4c Susi")
  if (/^[\d]+[a-z]\s+\w+$/i.test(str)) return false;

  // Address patterns at start
  if (/^\d+[-\/]?\d*\s+\d*\s*(ave|avenue|st|street|blvd|blv|boulevard|pl|place|rd|road|bell|crescent)/i.test(str)) return false;

  // Just numbers with dashes (like "210-20B", "218-24 68av")
  if (/^[\d\-\/]+[a-z]?(\s+\d+\w*)?$/i.test(str)) return false;

  // Apartment/address patterns like "75-36 Bell 3c"
  if (/^\d+[-\/]\d+\s+/i.test(str)) return false;

  // Name should start with a letter
  if (!/^[a-z]/i.test(str)) return false;

  // Has at least one letter and looks nameish
  if (/[a-z]/i.test(str)) return true;

  return false;
}

// Clean name - extract actual name from messy data
function cleanName(firstName, middleName, lastName, nickname) {
  // Combine parts
  let parts = [firstName, middleName, lastName].filter(p => p && p.trim());
  let name = parts.join(' ').trim();

  // If name looks like an address (starts with numbers), try nickname
  if (/^\d+[-\/]?\d*/.test(name) && nickname) {
    name = nickname;
  }

  // If still looks like an address, try to extract name before address
  // Pattern: "Name 123-45 Street" -> "Name"
  const nameBeforeAddr = name.match(/^([A-Za-z][A-Za-z\s\.\']+?)\s+\d+/);
  if (nameBeforeAddr && nameBeforeAddr[1].length >= 2) {
    name = nameBeforeAddr[1].trim();
  }

  // Remove address patterns from name
  // Patterns like "Amy 213-18, 69th Avenue Ground FL" -> "Amy"
  const addressPattern = /\s+\d+[-\/]?\d*.*?(ave|avenue|st|street|blvd|boulevard|pl|place|rd|road|ln|lane|dr|drive|crescent|prkw|pkwy).*$/i;
  name = name.replace(addressPattern, '').trim();

  // Remove delivery fee patterns like "$6", "Free P/D"
  name = name.replace(/\s*\$\d+\s*/g, ' ').trim();
  name = name.replace(/\s+free\s+p\/d\s*/gi, ' ').trim();

  // Remove floor patterns
  name = name.replace(/\s+(1st|2nd|3rd|ground|top)\s*(flr|floor)?$/i, '').trim();

  // Remove special instruction fragments often in names
  name = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  name = name.replace(/\s+own\s+soap.*$/i, '').trim();
  name = name.replace(/\s+no\s+soft.*$/i, '').trim();
  name = name.replace(/\s+call\s+after.*$/i, '').trim();
  name = name.replace(/\s+cold\s+wash.*$/i, '').trim();
  name = name.replace(/\s+tide.*$/i, '').trim();

  // Remove trailing punctuation and extra words
  name = name.replace(/[-,\.\/]+$/, '').trim();
  name = name.replace(/\s+(bell|ave|avenue|st|street)$/i, '').trim();

  // Clean up multiple spaces
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

// Extract address from various fields
function extractAddress(firstName, middleName, lastName, formattedAddr, streetAddr) {
  // Try formatted address first
  if (formattedAddr && formattedAddr.trim()) {
    let addr = formattedAddr.split(' ::: ')[0].trim();
    // Clean up multiline addresses
    addr = addr.replace(/\n/g, ', ').replace(/\s+/g, ' ').trim();
    // Remove "United States" if at end
    addr = addr.replace(/,?\s*United States\s*$/i, '').trim();
    if (addr.length > 5) return addr;
  }

  // Try street address
  if (streetAddr && streetAddr.trim()) {
    let addr = streetAddr.split(' ::: ')[0].trim();
    if (addr.length > 5) return addr;
  }

  // Try to extract from name fields (common pattern: "Name 123-45 Street")
  const combined = [firstName, middleName, lastName].join(' ');
  const addrMatch = combined.match(/(\d+[-\/]?\d*\s+\d*\s*[A-Za-z]+.*?(ave|avenue|st|street|blvd|boulevard|pl|place|rd|road|ln|lane|dr|drive|crescent|prkw|pkwy).*)/i);
  if (addrMatch) {
    let addr = addrMatch[1].trim();
    // Clean up
    addr = addr.replace(/\s+/g, ' ').trim();
    return addr;
  }

  return '';
}

// Extract notes from various fields
function extractNotes(notesField, firstName, middleName, lastName) {
  let notes = [];

  // From notes field
  if (notesField && notesField.trim()) {
    notes.push(notesField.trim());
  }

  // Check name fields for special instructions
  const combined = [firstName, middleName, lastName].join(' ');

  // Own soap
  if (/own\s+soap/i.test(combined)) {
    notes.push('Own Soap');
  }

  // No softener
  if (/no\s+soft/i.test(combined)) {
    notes.push('No Softener');
  }

  // Cold wash
  if (/cold\s+wash/i.test(combined)) {
    notes.push('Cold Wash');
  }

  // Delivery fee in name
  const feeMatch = combined.match(/\$(\d+)/);
  if (feeMatch) {
    notes.push(`Delivery $${feeMatch[1]}`);
  }

  // Free delivery
  if (/free\s+p\/d/i.test(combined)) {
    notes.push('Free P/D');
  }

  return notes.join('; ');
}

// Extract delivery fee
function extractDeliveryFee(firstName, middleName, lastName, notesField) {
  const combined = [firstName, middleName, lastName, notesField].join(' ');

  // Look for $X patterns
  const feeMatch = combined.match(/\$(\d+)/);
  if (feeMatch) {
    return `$${feeMatch[1]}.00`;
  }

  // Free delivery
  if (/free\s+p\/d/i.test(combined) || /free\s+delivery/i.test(combined)) {
    return '$0.00';
  }

  return '$3.00'; // Default
}

// Parse a single CSV file
function parseCSVFile(filePath) {
  console.log(`\nParsing: ${filePath}`);

  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`  Error reading file: ${err.message}`);
    return [];
  }

  const lines = content.split('\n');
  if (lines.length < 2) {
    console.error('  File appears empty');
    return [];
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  const colIndex = {};
  header.forEach((col, i) => {
    colIndex[col] = i;
  });

  const contacts = [];

  // Parse data lines
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    const firstName = values[colIndex['First Name']] || '';
    const middleName = values[colIndex['Middle Name']] || '';
    const lastName = values[colIndex['Last Name']] || '';
    const nickname = values[colIndex['Nickname']] || '';
    const notes = values[colIndex['Notes']] || '';
    const phone = values[colIndex['Phone 1 - Value']] || '';
    const formattedAddr = values[colIndex['Address 1 - Formatted']] || '';
    const streetAddr = values[colIndex['Address 1 - Street']] || '';

    // Skip if no phone
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      continue;
    }

    // Clean the data
    const cleanedName = cleanName(firstName, middleName, lastName, nickname);
    const address = extractAddress(firstName, middleName, lastName, formattedAddr, streetAddr);
    const extractedNotes = extractNotes(notes, firstName, middleName, lastName);
    const deliveryFee = extractDeliveryFee(firstName, middleName, lastName, notes);

    // Skip if no valid name
    if (!cleanedName || cleanedName.length < 2) {
      continue;
    }

    // Skip if name doesn't look like a real name (apartment codes, addresses only, etc.)
    if (!looksLikeName(cleanedName)) {
      continue;
    }

    contacts.push({
      name: cleanedName,
      phoneNumber: formatPhone(normalizedPhone),
      phoneDigits: normalizedPhone,
      address: address,
      notes: extractedNotes,
      deliveryFee: deliveryFee,
      rawFirstName: firstName,
      rawMiddleName: middleName,
      rawLastName: lastName,
    });
  }

  console.log(`  Found ${contacts.length} valid contacts`);
  return contacts;
}

// Deduplicate contacts by phone
function deduplicateContacts(allContacts) {
  const byPhone = new Map();

  for (const contact of allContacts) {
    const existing = byPhone.get(contact.phoneDigits);
    if (!existing) {
      byPhone.set(contact.phoneDigits, contact);
    } else {
      // Merge: prefer longer name, combine addresses/notes
      if (contact.name.length > existing.name.length) {
        existing.name = contact.name;
      }
      if (contact.address && !existing.address) {
        existing.address = contact.address;
      }
      if (contact.notes && !existing.notes) {
        existing.notes = contact.notes;
      }
    }
  }

  return Array.from(byPhone.values());
}

async function main() {
  console.log('='.repeat(60));
  console.log('Customer Contact Import Tool');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : DO_IMPORT ? 'IMPORT NEW' : 'UPDATE EXISTING'}`);

  // Parse all CSV files
  let allContacts = [];
  for (const file of CSV_FILES) {
    const contacts = parseCSVFile(file);
    allContacts = allContacts.concat(contacts);
  }

  console.log(`\nTotal contacts from all files: ${allContacts.length}`);

  // Deduplicate
  const uniqueContacts = deduplicateContacts(allContacts);
  console.log(`After deduplication: ${uniqueContacts.length}`);

  // Connect to database
  await mongoose.connect(MONGODB_URI);
  console.log('\nConnected to MongoDB');

  // Get existing customers
  const existingCustomers = await Customer.find({});
  console.log(`Existing customers in database: ${existingCustomers.length}`);

  // Create phone lookup map for existing customers
  const existingByPhone = new Map();
  for (const cust of existingCustomers) {
    const digits = normalizePhone(cust.phoneNumber);
    if (digits) {
      existingByPhone.set(digits, cust);
    }
  }

  // Compare
  const newCustomers = [];
  const matchedCustomers = [];
  const needsUpdate = [];

  for (const contact of uniqueContacts) {
    const existing = existingByPhone.get(contact.phoneDigits);

    if (!existing) {
      newCustomers.push(contact);
    } else {
      matchedCustomers.push({ csv: contact, db: existing });

      // Check if DB record needs updates
      const updates = [];
      if (!existing.address && contact.address) {
        updates.push({ field: 'address', value: contact.address });
      }
      if (!existing.notes && contact.notes) {
        updates.push({ field: 'notes', value: contact.notes });
      }
      if (existing.deliveryFee === '$03.00' && contact.deliveryFee !== '$3.00') {
        updates.push({ field: 'deliveryFee', value: contact.deliveryFee });
      }

      if (updates.length > 0) {
        needsUpdate.push({ csv: contact, db: existing, updates });
      }
    }
  }

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  console.log(`\n NEW CUSTOMERS (not in database): ${newCustomers.length}`);
  console.log('-'.repeat(40));
  for (const c of newCustomers.slice(0, 20)) {
    console.log(`  ${c.name}`);
    console.log(`    Phone: ${c.phoneNumber}`);
    if (c.address) console.log(`    Address: ${c.address}`);
    if (c.notes) console.log(`    Notes: ${c.notes}`);
  }
  if (newCustomers.length > 20) {
    console.log(`  ... and ${newCustomers.length - 20} more`);
  }

  console.log(`\n MATCHED CUSTOMERS: ${matchedCustomers.length}`);

  console.log(`\n CUSTOMERS NEEDING UPDATES: ${needsUpdate.length}`);
  console.log('-'.repeat(40));
  for (const { csv, db, updates } of needsUpdate.slice(0, 15)) {
    console.log(`  ${db.name} (${db.phoneNumber})`);
    for (const u of updates) {
      console.log(`    ${u.field}: "${db[u.field] || '(empty)'}" -> "${u.value}"`);
    }
  }
  if (needsUpdate.length > 15) {
    console.log(`  ... and ${needsUpdate.length - 15} more`);
  }

  // Perform imports/updates if not dry run
  if (DO_IMPORT && newCustomers.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('IMPORTING NEW CUSTOMERS');
    console.log('='.repeat(60));

    // Get max ID
    const maxIdDoc = await Customer.findOne().sort({ id: -1 });
    let nextId = (maxIdDoc?.id || 0) + 1;

    let imported = 0;
    for (const contact of newCustomers) {
      try {
        await Customer.create({
          id: nextId++,
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          address: contact.address || '',
          notes: contact.notes || '',
          deliveryFee: contact.deliveryFee || '$3.00',
          buzzerCode: '',
          credit: 0,
          creditHistory: [],
        });
        imported++;
        console.log(`  Imported: ${contact.name}`);
      } catch (err) {
        console.error(`  Failed to import ${contact.name}: ${err.message}`);
      }
    }
    console.log(`\nImported ${imported} new customers`);
  }

  if (DO_UPDATE && needsUpdate.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('UPDATING EXISTING CUSTOMERS');
    console.log('='.repeat(60));

    let updated = 0;
    for (const { db, updates } of needsUpdate) {
      try {
        const updateObj = {};
        for (const u of updates) {
          updateObj[u.field] = u.value;
        }
        await Customer.updateOne({ _id: db._id }, { $set: updateObj });
        updated++;
        console.log(`  Updated: ${db.name}`);
      } catch (err) {
        console.error(`  Failed to update ${db.name}: ${err.message}`);
      }
    }
    console.log(`\nUpdated ${updated} customers`);
  }

  if (DRY_RUN) {
    console.log('\n' + '='.repeat(60));
    console.log('DRY RUN - No changes made');
    console.log('Run with --import to add new customers');
    console.log('Run with --update to update existing customers');
    console.log('='.repeat(60));
  }

  await mongoose.disconnect();
}

main().catch(console.error);
