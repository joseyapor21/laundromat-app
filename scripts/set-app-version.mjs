#!/usr/bin/env node
import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI;

const AppVersionSchema = new mongoose.Schema({
  minVersion: { type: String, required: true, default: '1.0.0' },
  latestVersion: { type: String, required: true, default: '1.0.0' },
  updateMessage: { type: String, default: 'A new version of the app is available.' },
  forceUpdate: { type: Boolean, default: false },
  iosExternalUrl: { type: String },
  androidExternalUrl: { type: String },
}, { timestamps: true });

const AppVersion = mongoose.models.AppVersion || mongoose.model('AppVersion', AppVersionSchema);

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);

  // Configuration - update these values as needed
  const config = {
    minVersion: '1.0.1',           // Minimum version required
    latestVersion: '1.0.1',        // Latest available version
    updateMessage: 'A new version of Laundromat is available with important updates. Please update to continue using the app.',
    forceUpdate: true,             // Force users to update
    iosExternalUrl: 'https://loadly.io/vdrmv2bS',
    androidExternalUrl: 'https://loadly.io/OobNYNGW',
  };

  // Update or create the config
  let existing = await AppVersion.findOne();

  if (existing) {
    Object.assign(existing, config);
    await existing.save();
    console.log('Updated existing app version config:');
  } else {
    existing = await AppVersion.create(config);
    console.log('Created new app version config:');
  }

  console.log(JSON.stringify({
    minVersion: existing.minVersion,
    latestVersion: existing.latestVersion,
    forceUpdate: existing.forceUpdate,
    iosExternalUrl: existing.iosExternalUrl,
    androidExternalUrl: existing.androidExternalUrl,
  }, null, 2));

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
