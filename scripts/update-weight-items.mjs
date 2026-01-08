// Update specific extra items with perWeightUnit
// Run: node scripts/update-weight-items.mjs "mongodb://..."

import mongoose from 'mongoose';

const uri = process.argv[2];
if (!uri) {
  console.error('Usage: node scripts/update-weight-items.mjs "mongodb://..."');
  process.exit(1);
}

const extraItemSchema = new mongoose.Schema({
  name: String,
  perWeightUnit: Number,
}, { collection: 'extraItems', strict: false });

const ExtraItem = mongoose.model('ExtraItem', extraItemSchema);

// Items that should be priced per 15 lbs
const weightBasedItems = [
  'Separation Fee',
  'Free & Clear Detergent',
  'Tide Detergent',
  'Tide + Downy',
  'Suavitel Softener',
  'Extra Softener',
  'Bleach',
  'Vinegar',
];

async function update() {
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  for (const name of weightBasedItems) {
    const result = await ExtraItem.updateOne(
      { name },
      { $set: { perWeightUnit: 15 } }
    );
    if (result.matchedCount > 0) {
      console.log(`Updated: ${name} -> per 15 lbs`);
    } else {
      console.log(`Not found: ${name}`);
    }
  }

  await mongoose.disconnect();
  console.log('Done!');
}

update().catch(console.error);
