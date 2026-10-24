import mongoose from 'mongoose';

const payrollRunSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    status: { type: String, enum: ['draft', 'finalized'], default: 'draft' },
    workingDays: { type: Number, required: true },
    totals: { employees: Number, gross: Number, deductions: Number, tax: Number, net: Number },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    finalizedAt: { type: Date },
  },
  { timestamps: true }
);

payrollRunSchema.index({ year: 1, month: 1 }, { unique: true });

export const PayrollRun = mongoose.model('PayrollRun', payrollRunSchema);
