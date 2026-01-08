// Script to seed extra items via MongoDB
// Run with: node scripts/seed-extra-items.mjs
// Or with custom URI: node scripts/seed-extra-items.mjs "mongodb://user:pass@host:port/db"

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

const extraItemSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  isActive: Boolean,
  category: String,
}, {
  collection: 'extraItems',
  timestamps: true,
});

const ExtraItem = mongoose.model('ExtraItem', extraItemSchema);

const specialItems = [
  // Comforters
  { name: 'Comforter - Twin', description: 'Twin size comforter', price: 10, isActive: true, category: 'bedding' },
  { name: 'Comforter - Full', description: 'Full size comforter', price: 12, isActive: true, category: 'bedding' },
  { name: 'Comforter - Queen', description: 'Queen size comforter', price: 15, isActive: true, category: 'bedding' },
  { name: 'Comforter - King', description: 'King size comforter', price: 20, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - Twin', description: 'Twin size down comforter (+$10)', price: 20, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - Full', description: 'Full size down comforter (+$10)', price: 22, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - Queen', description: 'Queen size down comforter (+$10)', price: 25, isActive: true, category: 'bedding' },
  { name: 'Down Comforter - King', description: 'King size down comforter (+$10)', price: 30, isActive: true, category: 'bedding' },

  // Other bedding
  { name: 'Down Jacket', description: 'Down jacket cleaning', price: 15, isActive: true, category: 'special' },
  { name: 'Sleeping Bag', description: 'Sleeping bag cleaning', price: 20, isActive: true, category: 'special' },
  { name: 'Blanket/Quilt - Small', description: 'Small blanket or quilt', price: 10, isActive: true, category: 'bedding' },
  { name: 'Blanket/Quilt - Large', description: 'Large blanket or quilt', price: 20, isActive: true, category: 'bedding' },
  { name: 'Mattress Cover - Small', description: 'Twin/Full mattress cover', price: 5, isActive: true, category: 'bedding' },
  { name: 'Mattress Cover - Large', description: 'Queen/King mattress cover', price: 10, isActive: true, category: 'bedding' },
  { name: 'Pillow - Small', description: 'Standard pillow', price: 5, isActive: true, category: 'bedding' },
  { name: 'Pillow - Large', description: 'King/body pillow', price: 8, isActive: true, category: 'bedding' },
  { name: 'Pet Bed - Small', description: 'Small pet bed', price: 8, isActive: true, category: 'special' },
  { name: 'Pet Bed - Large', description: 'Large pet bed', price: 15, isActive: true, category: 'special' },
  { name: 'Bathmat - Small', description: 'Small bathmat', price: 3, isActive: true, category: 'special' },
  { name: 'Bathmat - Large', description: 'Large bathmat', price: 10, isActive: true, category: 'special' },

  // Services/Fees
  { name: 'Separation Fee', description: 'Separate laundry (per 15 lbs)', price: 3, isActive: true, category: 'service' },
  { name: 'Low Temp/Delicate Dry', description: 'Delicate drying per bag', price: 5, isActive: true, category: 'service' },
  { name: 'Hang Dry (per item)', description: 'Hang dry per item', price: 0.25, isActive: true, category: 'service' },
  { name: 'Hanger', description: 'Hanger fee each', price: 0.15, isActive: true, category: 'service' },

  // Detergents & Softeners
  { name: 'Free & Clear Detergent', description: 'Hypoallergenic detergent (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Tide Detergent', description: 'Tide detergent (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Tide + Downy', description: 'Tide with Downy (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Suavitel Softener', description: 'Suavitel fabric softener (per 15 lbs)', price: 3, isActive: true, category: 'detergent' },
  { name: 'Extra Softener', description: 'Extra softener (per 15 lbs)', price: 2, isActive: true, category: 'detergent' },
  { name: 'Bleach', description: 'Bleach treatment (per 15 lbs)', price: 1.50, isActive: true, category: 'detergent' },
  { name: 'Vinegar', description: 'Vinegar treatment (per 15 lbs)', price: 1.50, isActive: true, category: 'detergent' },
];

async function seedItems() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check existing items
    const existingCount = await ExtraItem.countDocuments();
    console.log(`Found ${existingCount} existing extra items`);

    // Insert new items (skip duplicates by name)
    let added = 0;
    for (const item of specialItems) {
      const exists = await ExtraItem.findOne({ name: item.name });
      if (!exists) {
        await ExtraItem.create(item);
        console.log(`Added: ${item.name} - $${item.price}`);
        added++;
      } else {
        console.log(`Skipped (exists): ${item.name}`);
      }
    }

    console.log(`\nDone! Added ${added} new items.`);
    const totalCount = await ExtraItem.countDocuments();
    console.log(`Total extra items in database: ${totalCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

seedItems();
