import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

async function loadUser(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, 'Account not found or deactivated');
  req.user = user;
}

// Blocks users who still have a temporary password from everything else.
export async function authenticate(req, _res, next) {
  await loadUser(req);
  if (req.user.mustChangePassword) throw new ApiError(403, 'Password change required');
  next();
}

// For /auth/me and /auth/change-password, which must work with a temporary password.
export async function authenticateAllowTempPassword(req, _res, next) {
  await loadUser(req);
  next();
}

export const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw new ApiError(403, 'You do not have access to this resource');
  next();
};
