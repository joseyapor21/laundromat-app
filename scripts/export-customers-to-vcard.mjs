import { MongoClient } from 'mongodb';
import fs from 'fs';

const MONGODB_URI = 'mongodb://Joseyapor21:J7249656y@192.168.8.254:27017/?authSource=admin&connectTimeoutMS=10000&socketTimeoutMS=10000';
const DB_NAME = 'laundromat';

function escapeVCard(str) {
  if (!str) return '';
  // Escape special characters in vCard
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatPhoneNumber(phone) {
  if (!phone) return '';
  // Remove non-digits
  const digits = phone.replace(/\D/g, '');
  // Format as standard phone number
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+1${digits}`;
}

function customerToVCard(customer, locationName) {
  const name = customer.name || 'Unknown';
  const phone = formatPhoneNumber(customer.phoneNumber);
  const address = customer.address || '';
  const notes = customer.notes || '';

  // Build vCard
  let vcard = 'BEGIN:VCARD\n';
  vcard += 'VERSION:3.0\n';
  vcard += `FN:${escapeVCard(name)}\n`;
  vcard += `N:${escapeVCard(name)};;;;\n`;

  if (phone) {
    vcard += `TEL;TYPE=CELL:${phone}\n`;
  }

  if (address) {
    vcard += `ADR;TYPE=HOME:;;${escapeVCard(address)};;;;\n`;
  }

  // Add notes and location as note
  let noteContent = [];
  if (notes) noteContent.push(notes);
  if (locationName) noteContent.push(`Location: ${locationName}`);
  if (customer.buzzerCode) noteContent.push(`Buzzer: ${customer.buzzerCode}`);
  if (customer.deliveryFee) noteContent.push(`Delivery Fee: ${customer.deliveryFee}`);

  if (noteContent.length > 0) {
    vcard += `NOTE:${escapeVCard(noteContent.join(' | '))}\n`;
  }

  // Add organization/company as the laundromat name for easy identification
  vcard += `ORG:${escapeVCard(locationName || 'Laundromat')}\n`;

  vcard += 'END:VCARD\n';

  return vcard;
}

async function main() {
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // First, list all locations
    const locationsCollection = db.collection('locations');
    const locations = await locationsCollection.find({}).toArray();

    console.log('\n=== Available Locations ===');
    locations.forEach((loc, idx) => {
      console.log(`${idx + 1}. ${loc.name} (ID: ${loc._id}) - ${loc.address}`);
    });

    if (locations.length < 2) {
      console.log('\nOnly one location found. Exporting all customers...');
    }

    // Get the second location (index 1)
    const targetLocation = locations[1]; // Second location

    if (!targetLocation) {
      console.log('\nNo second location found!');
      return;
    }

    console.log(`\n=== Exporting customers from: ${targetLocation.name} ===`);

    // Get customers for the second location
    const customersCollection = db.collection('customers');
    const customers = await customersCollection.find({
      locationId: targetLocation._id
    }).toArray();

    console.log(`Found ${customers.length} customers`);

    if (customers.length === 0) {
      console.log('No customers found for this location.');
      return;
    }

    // Generate vCard file
    let vcardContent = '';
    for (const customer of customers) {
      vcardContent += customerToVCard(customer, targetLocation.name);
    }

    // Save to file
    const outputPath = `/Users/joseyapor/Desktop/${targetLocation.name.replace(/[^a-zA-Z0-9]/g, '_')}_customers.vcf`;
    fs.writeFileSync(outputPath, vcardContent, 'utf-8');

    console.log(`\n=== Export Complete ===`);
    console.log(`Exported ${customers.length} contacts to:`);
    console.log(outputPath);
    console.log('\nTo import to iCloud:');
    console.log('1. Open the .vcf file on your Mac');
    console.log('2. It will open in Contacts app');
    console.log('3. Make sure iCloud is selected as the account');
    console.log('4. Click "Import" to add all contacts');
    console.log('5. They will sync to your iPhone automatically');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\nDone.');
  }
}

main();
