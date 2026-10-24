import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    days: { type: Number, required: true, min: 1 }, // working days only
    reason: { type: String, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    comment: { type: String, trim: true },
    viaAi: { type: Boolean, default: false },
  },
  { timestamps: true }
);

leaveSchema.index({ employee: 1, start: 1, end: 1 });
leaveSchema.index({ status: 1, start: 1 });

export const Leave = mongoose.model('Leave', leaveSchema);
