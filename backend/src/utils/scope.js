import { ApiError } from './ApiError.js';
import { User } from '../models/User.js';

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

// Approvals (leave, attendance corrections): nobody reviews their own request. HR reviews everyone else;
// Admin reviews only HR staff, so an HR officer's request is not stuck when there is no other HR.
export async function assertCanReview(user, employeeId) {
  if (String(employeeId) === String(user.employee)) throw new ApiError(403, 'You cannot review your own request');
  if (user.role === 'admin' && !(await User.exists({ employee: employeeId, role: 'hr' }))) {
    throw new ApiError(403, 'Admin reviews requests from HR staff only; HR reviews employee requests');
  }
}

// Who gets told about a new request: HR, plus Admin when the requester is HR staff.
export const reviewerRoles = (user) => (user.role === 'hr' ? ['hr', 'admin'] : ['hr']);

// Lets the approval inboxes show Admin which requests are from HR staff.
export const requesterPopulate = (select) => ({
  path: 'employee',
  select: `${select} user`,
  populate: [{ path: 'user', select: 'role' }, ...(select.includes('department') ? [{ path: 'department', select: 'name' }] : [])],
});

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
