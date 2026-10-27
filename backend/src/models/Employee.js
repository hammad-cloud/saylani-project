import mongoose from 'mongoose';

export const EMPLOYEE_STATUSES = ['active', 'probation', 'exited'];

const employeeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    designation: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    joinDate: { type: Date, required: true },
    exitDate: { type: Date },
    status: { type: String, enum: EMPLOYEE_STATUSES, default: 'active' },
    basicSalary: { type: Number, required: true, min: 1 }, // gross = 1.5 × basic (HRA 40%, medical 10%)
    faceDescriptor: { type: [Number], select: false, default: undefined }, // legacy: one enrolled face (single photo)
    // Face set-up (Face ID style): one 128-number descriptor per head angle; check-in matches the closest.
    faceDescriptors: { type: [[Number]], select: false, default: undefined },
  },
  { timestamps: true }
);

employeeSchema.index({ name: 'text', email: 'text', code: 'text' });
employeeSchema.index({ department: 1, status: 1 });

export const Employee = mongoose.model('Employee', employeeSchema);
