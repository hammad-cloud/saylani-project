import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  await mongoose.connect(env.mongoUri);
  // Unique indexes enforce business rules (one attendance per day, unique codes): build them before serving.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}
