import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const MONGODB_BASE_URI = process.env.MONGODB_URI;
const APP_DB_NAME = process.env.APP_DB_NAME || 'laundromat';
const MONGODB_URI = `${MONGODB_BASE_URI}/${APP_DB_NAME}?authSource=admin`;

const CSV_FILES = [
  '/Users/joseyapor/Downloads/contacts (2).csv',
  '/Users/joseyapor/Downloads/contacts (1) (1).csv',
  '/Users/joseyapor/Downloads/contacts.csv',
];

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

function normalizePhone(phone) {
  if (!phone) return '';
  const firstPhone = phone.split(' ::: ')[0];
  const digits = firstPhone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += char;
  }
  result.push(current.trim());
  return result;
}

function extractName(firstName) {
  if (!firstName) return '';
  const match = firstName.match(/^([A-Za-z][A-Za-z\s\.\']+?)\s+\d/);
  if (match && match[1].length >= 2) return match[1].trim();
  return firstName.split(/\s+\d/)[0].trim();
}

function extractAddress(firstName) {
  if (!firstName) return '';
  const match = firstName.match(/(\d+[-\/]?\d*\s+.*)/);
  return match ? match[1].trim() : '';
}

async function main() {
  console.log('Finding contacts WITHOUT phone numbers...\n');
  
  const noPhoneContacts = [];
  
  for (const filePath of CSV_FILES) {
    console.log(`Parsing: ${filePath}`);
    let content;
    try { content = readFileSync(filePath, 'utf-8'); }
    catch (err) { console.error(`  Error: ${err.message}`); continue; }
    
    const lines = content.split('\n');
    const header = parseCSVLine(lines[0]);
    const colIndex = {};
    header.forEach((col, i) => { colIndex[col] = i; });
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = parseCSVLine(line);
      const firstName = values[colIndex['First Name']] || '';
      const phone = values[colIndex['Phone 1 - Value']] || '';
      const notes = values[colIndex['Notes']] || '';
      
      const normalizedPhone = normalizePhone(phone);
      
      if (!normalizedPhone || normalizedPhone.length < 10) {
        const name = extractName(firstName);
        const address = extractAddress(firstName);
        
        if (name && name.length >= 2 && /^[A-Za-z]/.test(name)) {
          noPhoneContacts.push({ name, address, notes: notes || '' });
        }
      }
    }
  }
  
  const uniqueByName = new Map();
  for (const c of noPhoneContacts) {
    const key = c.name.toLowerCase();
    if (!uniqueByName.has(key)) uniqueByName.set(key, c);
    else {
      const existing = uniqueByName.get(key);
      if (c.address.length > existing.address.length) existing.address = c.address;
      if (c.notes.length > existing.notes.length) existing.notes = c.notes;
    }
  }
  
  const contacts = Array.from(uniqueByName.values());
  console.log(`\nFound ${contacts.length} contacts without phone numbers\n`);
  
  if (contacts.length === 0) { console.log('Nothing to import.'); return; }
  
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');
  
  const existingCustomers = await Customer.find({});
  const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase()));
  
  const toImport = contacts.filter(c => !existingNames.has(c.name.toLowerCase()));
  console.log(`${toImport.length} are new (not in database)\n`);
  
  if (toImport.length === 0) {
    console.log('All contacts already exist.');
    await mongoose.disconnect();
    return;
  }
  
  const maxIdDoc = await Customer.findOne().sort({ id: -1 });
  let nextId = (maxIdDoc?.id || 0) + 1;
  
  console.log('Importing:\n');
  let imported = 0;
  
  for (const contact of toImport) {
    try {
      await Customer.create({
        id: nextId++,
        name: contact.name,
        phoneNumber: '(555) 555-5555',
        address: contact.address || '',
        notes: contact.notes || '',
        deliveryFee: '$3.00',
        buzzerCode: '',
        credit: 0,
        creditHistory: [],
      });
      imported++;
      console.log(`  ✓ ${contact.name}`);
      if (contact.address) console.log(`      Address: ${contact.address}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${contact.name} - ${err.message}`);
    }
  }
  
  console.log(`\nImported ${imported} customers with phone (555) 555-5555`);
  await mongoose.disconnect();
}

main().catch(console.error);
