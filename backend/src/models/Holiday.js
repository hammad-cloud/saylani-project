import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true, unique: true },
  },
  { timestamps: true }
);

export const Holiday = mongoose.model('Holiday', holidaySchema);
