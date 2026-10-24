import mongoose from 'mongoose';

// Single company-wide settings document. Rules apply to new records only.
const settingSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    officeStart: { type: String, default: '09:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    graceMinutes: { type: Number, default: 15, min: 0 },
    halfDayHours: { type: Number, default: 5, min: 0 },
    weekend: { type: [Number], default: [0, 6] }, // 0 = Sunday ... 6 = Saturday
    officeLocation: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    radiusMeters: { type: Number, default: 150, min: 1 },
  },
  { timestamps: true }
);

export const Setting = mongoose.model('Setting', settingSchema);
