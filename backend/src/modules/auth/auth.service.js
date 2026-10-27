import jwt from 'jsonwebtoken';
import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role, tv: user.tokenVersion }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export async function login(email, password) {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new ApiError(401, 'Invalid email or password');
  if (!user.isActive) throw new ApiError(403, 'This account has been deactivated');
  return { token: signToken(user), user };
}

// Signs out every other session; the caller gets a fresh token so they stay signed in here.
export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw new ApiError(400, 'Current password is incorrect');
  if (currentPassword === newPassword) throw new ApiError(400, 'New password must be different');

  user.password = newPassword;
  user.mustChangePassword = false;
  user.tokenVersion += 1;
  await user.save();
  return { token: signToken(user), user };
}

// Server-side logout: revokes all of this user's tokens (every device).
export function logout(userId) {
  return User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}
