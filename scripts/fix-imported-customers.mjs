import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_BASE_URI = process.env.MONGODB_URI;
const APP_DB_NAME = process.env.APP_DB_NAME || 'laundromat';
const MONGODB_URI = `${MONGODB_BASE_URI}/${APP_DB_NAME}?authSource=admin`;

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

// Real customers to keep and fix
const fixList = [
  { oldName: 'Ellene Niyazov', name: 'Ellene Niyazov', address: '75-24 Bell Blvd' },
  { oldName: 'Reisa Brafman', name: 'Reisa Brafman', address: '86-70 Francis Lewis Blvd', notes: 'Own Dryer Sheets (Seventh generation), Folded in small multiple bags' },
  { oldName: 'Barbra / Alan.', name: 'Barbra / Alan', address: '211-40 18th Ave' },
  { oldName: 'Alex Benson -', name: 'Alex Benson', address: '196-10D 65th Ave' },
  { oldName: 'Ana +Glen Esposito', name: 'Ana & Glen Esposito', address: '73-11 210th St' },
  { oldName: 'Barbara Harris', name: 'Barbara Harris', address: '58-38 Oceania St, Bayside 11364', notes: 'Own soap' },
  { oldName: 'Elinore Y', name: 'Elinore Y', address: '73-03 198th Street, Fresh Meadows 11366' },
  { oldName: 'Eric Boncina -', name: 'Eric Boncina', address: '188-40 B 71st Crescent #3C', notes: 'Green Bag (Melvin), Brown Bag (Eric), Tide & Downy' },
  { oldName: 'Gerard M', name: 'Gerard M', address: '67-35 Bell Blvd' },
  { oldName: 'Ira Soller', name: 'Ira Soller', address: '23-35 Bell Blvd, Bayside, Apt 4B', notes: 'Payment method check. Remove the tags and tape when we deliver the laundry.' },
  { oldName: 'Irma Sham', name: 'Irma Sham', address: '252-12 58th Avenue, Little Neck, 2nd Floor', notes: 'No Softener' },
  { oldName: 'JAME', name: 'James', address: '75-20 Bell Blvd' },
  { oldName: 'Jerry Klein', name: 'Jerry Klein', address: '61-36 218th Street', notes: 'No Softener' },
  { oldName: 'Kira', name: 'Kira', address: '' },
  { oldName: 'Leana/ Madeline', name: 'Leana / Madeline', address: '73-23 220th St, 1st FL Left Side', notes: 'No Softener, Black Hamper is 2 lbs' },
  { oldName: 'Li', name: 'Li', address: '' },
  { oldName: 'Linda Billingsley -', name: 'Linda Billingsley', address: '73-31 220th St', notes: 'Payment method (check)' },
  { oldName: 'Liz C.', name: 'Liz C.', address: '217 Grosvenor St, Douglaston', notes: 'Pickup from driveway, Put clothes on lounge chair at end of driveway, PAYMENT: CHECK' },
  { oldName: 'Rich', name: 'Rich', address: '', notes: 'No Softener' },
  { oldName: 'Robert Shariff', name: 'Robert Shariff', address: '253-17 Northern Blvd (Lives Above Restaurant)', notes: 'Folded socks in pairs' },
  { oldName: 'Sara', name: 'Sara', address: '' },
  { oldName: 'Shekira P (Own', name: 'Shekira P', address: '', notes: 'Own soap' },
  { oldName: 'Souren N.', name: 'Souren N.', address: '224-78 Horace Harding Expressway, 2nd Floor', notes: 'Ring top bell and hold it firm' },
  { oldName: 'Sourien Mozien', name: 'Sourien Mozien', address: '224-78 Horace Harding Expressway, 2nd Floor' },
  { oldName: 'Tom', name: 'Tom', address: '' },
  { oldName: 'Vlad', name: 'Vlad', address: '' },
  { oldName: 'Yolanda P', name: 'Yolanda P', address: '71-22 260th Street, 1st Floor, Glen Oaks' },
  { oldName: 'YOO HAN NA/ SOON AE', name: 'Yoo Han Na / Soon Ae', address: '192-05B 73rd Ave' },
];

// Junk entries to delete (pattern matching)
const junkPatterns = [
  /^United States/i,
  /^Fresh Meadows$/i,
  /^Apt$/i,
  /^Don't bother/i,
  /^Floral Hamper/i,
  /^Bayside$/i,
  /^Customer Care$/i,
  /^NY$/i,
  /^Oakland Gardens/i,
  /^Oaland Gardens$/i,
  /^FL :::/i,
  /^Ground Floor/i,
  /^Ground$/i,
  /^Dont call/i,
  /^Wait for him/i,
  /^Ave :::/i,
  /^Own Dryer Sheets/i,
  /^Folded in small/i,
  /^Downstairs/i,
  /^Payment method/i,
  /^Inform before/i,
  /^On$/i,
  /^AVE,,,/i,
  /^Green Bag/i,
  /^Brown Bag/i,
  /^Tide & Downy/i,
  /^No Softener/i,
  /^Black Hamper/i,
  /^Pickup from/i,
  /^Put clothes/i,
  /^PAYMENT:/i,
  /^Ring top bell/i,
];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Get all customers with placeholder phone
  const placeholderCustomers = await Customer.find({ phoneNumber: '(555) 555-5555' });
  console.log(`Found ${placeholderCustomers.length} customers with placeholder phone\n`);

  let fixed = 0;
  let deleted = 0;

  for (const customer of placeholderCustomers) {
    // Check if it's in the fix list
    const fixEntry = fixList.find(f => f.oldName === customer.name);

    if (fixEntry) {
      // Update the customer
      const updates = {
        name: fixEntry.name,
      };
      if (fixEntry.address) updates.address = fixEntry.address;
      if (fixEntry.notes) updates.notes = fixEntry.notes;

      await Customer.updateOne({ _id: customer._id }, { $set: updates });
      console.log(`Fixed: "${customer.name}" -> "${fixEntry.name}"`);
      if (fixEntry.address) console.log(`    Address: ${fixEntry.address}`);
      fixed++;
    } else {
      // Check if it matches junk patterns
      const isJunk = junkPatterns.some(pattern => pattern.test(customer.name));

      if (isJunk) {
        await Customer.deleteOne({ _id: customer._id });
        console.log(`Deleted junk: "${customer.name}"`);
        deleted++;
      } else {
        console.log(`Skipped (review manually): "${customer.name}"`);
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`Fixed: ${fixed} customers`);
  console.log(`Deleted: ${deleted} junk entries`);

  await mongoose.disconnect();
}

main().catch(console.error);
