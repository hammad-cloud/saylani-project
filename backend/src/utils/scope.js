import { ApiError } from './ApiError.js';

// Data-scope guard (M1): an Employee only ever touches rows with their own employee id.
// Returns the employee id the query must be limited to, or null for Admin/HR (all rows).
export function scopedEmployeeId(user, requestedId) {
  if (user.role !== 'employee') return requestedId || null;
  if (!user.employee) throw new ApiError(403, 'No employee profile linked to this account');
  if (requestedId && String(requestedId) !== String(user.employee)) {
    throw new ApiError(403, 'You can only access your own records');
  }
  return user.employee;
}

// Self-service actions (check-in, apply leave) always act on the caller's own profile, whatever the role.
export function selfEmployeeId(user) {
  if (!user.employee) throw new ApiError(403, 'No employee profile is linked to this account');
  return user.employee;
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
