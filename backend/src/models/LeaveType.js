import mongoose from 'mongoose';

const leaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    yearlyQuota: { type: Number, default: null, min: 0 }, // null = unlimited
    paid: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual', code: 'annual', yearlyQuota: 14, paid: true },
  { name: 'Sick', code: 'sick', yearlyQuota: 8, paid: true },
  { name: 'Casual', code: 'casual', yearlyQuota: 10, paid: true },
  { name: 'Unpaid', code: 'unpaid', yearlyQuota: null, paid: false },
];

export const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);
