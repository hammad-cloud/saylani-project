import mongoose from 'mongoose';

const payslipSchema = new mongoose.Schema(
  {
    run: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    finalized: { type: Boolean, default: false },
    basic: Number,
    hra: Number,
    medical: Number,
    gross: Number,
    perDay: Number,
    proratedGross: Number,
    attendance: {
      workingDays: Number,
      employedDays: Number,
      present: Number,
      late: Number,
      halfDays: Number,
      absent: Number,
      paidLeave: Number,
      unpaidLeave: Number,
      latePenaltyDays: Number,
    },
    deductionDays: Number,
    attendanceDeduction: Number,
    tax: Number,
    net: Number,
  },
  { timestamps: true }
);

payslipSchema.index({ run: 1, employee: 1 }, { unique: true });
payslipSchema.index({ employee: 1, year: -1, month: -1 });

export const Payslip = mongoose.model('Payslip', payslipSchema);
