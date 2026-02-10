import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Use command line arg or environment variable
const MONGODB_URI = process.argv[2] || process.env.MONGODB_URI || 'mongodb://192.168.8.254:27017/laundromat';

console.log('Connecting to:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

// Define schemas
const locationSchema = new mongoose.Schema({
  name: String,
  code: String,
  address: String,
  phone: String,
});

const extraItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  perWeightUnit: { type: Number },
  minimumCharge: { type: Number },
  category: { type: String },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
});

async function copyExtraItems() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const Location = mongoose.models.Location || mongoose.model('Location', locationSchema);
    const ExtraItem = mongoose.models.ExtraItem || mongoose.model('ExtraItem', extraItemSchema);

    // Get all locations
    const locations = await Location.find({}).lean();
    console.log('\nLocations found:');
    locations.forEach((loc, i) => {
      console.log(`  ${i + 1}. ${loc.name} (${loc.code}) - ID: ${loc._id}`);
    });

    if (locations.length < 2) {
      console.log('\nNeed at least 2 locations to copy items');
      process.exit(1);
    }

    const sourceLocation = locations[0]; // First store
    const targetLocation = locations[1]; // Second store

    console.log(`\nCopying extra items from "${sourceLocation.name}" to "${targetLocation.name}"...`);

    // Get extra items from source location
    const sourceItems = await ExtraItem.find({ locationId: sourceLocation._id }).lean();
    console.log(`\nFound ${sourceItems.length} extra items in ${sourceLocation.name}:`);
    sourceItems.forEach(item => {
      console.log(`  - ${item.name}: $${item.price}${item.perWeightUnit ? ` (per ${item.perWeightUnit} lbs)` : ''}`);
    });

    // Check existing items in target location
    const existingTargetItems = await ExtraItem.find({ locationId: targetLocation._id }).lean();
    console.log(`\nExisting items in ${targetLocation.name}: ${existingTargetItems.length}`);

    // Copy items that don't exist in target
    let copiedCount = 0;
    for (const item of sourceItems) {
      // Check if item with same name already exists in target
      const exists = existingTargetItems.some(
        existing => existing.name.toLowerCase() === item.name.toLowerCase()
      );

      if (exists) {
        console.log(`  Skipping "${item.name}" - already exists`);
        continue;
      }

      // Create new item for target location
      const newItem = new ExtraItem({
        name: item.name,
        price: item.price,
        perWeightUnit: item.perWeightUnit,
        minimumCharge: item.minimumCharge,
        category: item.category,
        locationId: targetLocation._id,
      });

      await newItem.save();
      console.log(`  Copied "${item.name}" to ${targetLocation.name}`);
      copiedCount++;
    }

    console.log(`\nDone! Copied ${copiedCount} extra items to ${targetLocation.name}`);

    // Verify
    const finalItems = await ExtraItem.find({ locationId: targetLocation._id }).lean();
    console.log(`\n${targetLocation.name} now has ${finalItems.length} extra items:`);
    finalItems.forEach(item => {
      console.log(`  - ${item.name}: $${item.price}${item.perWeightUnit ? ` (per ${item.perWeightUnit} lbs)` : ''}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

copyExtraItems();
