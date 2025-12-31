import mongoose from 'mongoose';
import { MongoClient, Db } from 'mongodb';

// Shared auth database connection (for v5users and v5departments)
const AUTH_MONGODB_URI = 'process.env.MONGODB_URI/emergency?authSource=admin';
const AUTH_DB_NAME = 'emergency';

let cachedAuthClient: MongoClient | null = null;
let cachedAuthDb: Db | null = null;

export async function getAuthDatabase(): Promise<Db> {
  if (cachedAuthClient && cachedAuthDb) {
    return cachedAuthDb;
  }

  const client = new MongoClient(AUTH_MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  const db = client.db(AUTH_DB_NAME);

  cachedAuthClient = client;
  cachedAuthDb = db;

  return db;
}

// App-specific database connection (for laundromat data)
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongoose || { conn: null, promise: null };

if (!global.mongoose) {
  global.mongoose = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('MongoDB connected successfully');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
