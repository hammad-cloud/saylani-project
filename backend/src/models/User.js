import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ROLES = ['admin', 'hr', 'employee'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    // Copied into each JWT; bumping it (password change/reset, logout) revokes every older token.
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// There is exactly one Admin, created by first-run setup: this makes a concurrent second setup fail.
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } });

userSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.tokenVersion;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
