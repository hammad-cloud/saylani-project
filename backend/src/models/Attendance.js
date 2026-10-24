import mongoose from 'mongoose';

export const ATTENDANCE_STATUSES = ['present', 'late', 'half_day', 'missing_checkout', 'absent'];

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' }, // copied for fast aggregation
    date: { type: Date, required: true }, // UTC midnight of the local calendar day
    checkIn: { type: Date },
    checkOut: { type: Date },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    source: { type: String, enum: ['web', 'camera', 'correction'], default: 'web' },
    location: { lat: Number, lng: Number, accuracy: Number, distance: Number, liveness: Boolean },
  },
  { timestamps: true }
);

// One record per employee per day: a second check-in hits this index (409).
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, department: 1 });

export const Attendance = mongoose.model('Attendance', attendanceSchema);
