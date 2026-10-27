import mongoose from 'mongoose';
import { Leave } from '../../models/Leave.js';
import { LeaveType } from '../../models/LeaveType.js';
import { Employee } from '../../models/Employee.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { notifyRoles, notifyUser } from '../../utils/notify.js';
import { assertCanReview, requesterPopulate, reviewerRoles, scopedEmployeeId, selfEmployeeId } from '../../utils/scope.js';
import { countWorkingDays, dayFromKey, today } from '../../utils/dates.js';
import { getSettings, getHolidayKeys } from '../settings/settings.service.js';

// shortcut: a leave spanning two years counts against the start year's quota; split per year if that matters.
const yearRange = (year) => ({ start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)) });

export async function getBalances(employeeId, year = new Date().getUTCFullYear()) {
  const { start, end } = yearRange(year);
  const [types, used] = await Promise.all([
    LeaveType.find().sort({ name: 1 }),
    Leave.aggregate([
      { $match: { employee: new mongoose.Types.ObjectId(String(employeeId)), status: { $in: ['approved', 'pending'] }, start: { $gte: start, $lte: end } } },
      { $group: { _id: { type: '$leaveType', status: '$status' }, days: { $sum: '$days' } } },
    ]),
  ]);

  const daysFor = (typeId, status) => used.find((u) => String(u._id.type) === String(typeId) && u._id.status === status)?.days || 0;
  return types.map((t) => {
    const approved = daysFor(t._id, 'approved');
    const pending = daysFor(t._id, 'pending');
    return {
      leaveType: { _id: t._id, name: t.name, code: t.code, paid: t.paid },
      quota: t.yearlyQuota,
      used: approved,
      pending,
      remaining: t.yearlyQuota == null ? null : t.yearlyQuota - approved,
    };
  });
}

export async function workingDaysBetween(start, end) {
  const settings = await getSettings();
  return countWorkingDays(start, end, settings.weekend, await getHolidayKeys(start, end));
}

async function assertCanTake(employeeId, leaveType, start, end, days, excludeId) {
  const overlap = await Leave.exists({
    employee: employeeId,
    status: { $in: ['pending', 'approved'] },
    start: { $lte: end },
    end: { $gte: start },
    ...(excludeId && { _id: { $ne: excludeId } }),
  });
  if (overlap) throw new ApiError(422, 'These dates overlap another leave request');

  if (leaveType.yearlyQuota == null) return;
  const balance = (await getBalances(employeeId, start.getUTCFullYear())).find((b) => String(b.leaveType._id) === String(leaveType._id));
  const committed = balance.used + (excludeId ? 0 : balance.pending);
  if (committed + days > leaveType.yearlyQuota) {
    throw new ApiError(422, `Not enough ${leaveType.name} leave: ${leaveType.yearlyQuota - committed} day(s) available, ${days} requested`);
  }
}

export async function applyLeave(user, { leaveType: leaveTypeId, start: startKey, end: endKey, reason, viaAi }) {
  const employeeId = selfEmployeeId(user);
  const start = dayFromKey(startKey);
  const end = dayFromKey(endKey);
  if (end < start) throw new ApiError(422, 'End date must be on or after the start date');
  if (start < today()) throw new ApiError(422, 'Leave cannot start in the past');

  const leaveType = await LeaveType.findById(leaveTypeId);
  if (!leaveType) throw new ApiError(422, 'Unknown leave type');
  const days = await workingDaysBetween(start, end);
  if (!days) throw new ApiError(422, 'The selected dates contain no working days (weekends and holidays are skipped)');

  await assertCanTake(employeeId, leaveType, start, end, days);

  const employee = await Employee.findById(employeeId, 'department');
  const leave = await Leave.create({ employee: employeeId, department: employee.department, leaveType: leaveType._id, start, end, days, reason, viaAi });
  await audit(user._id, 'create', 'Leave', { after: leave });
  await notifyRoles(reviewerRoles(user), 'New leave request', `${user.name} applied for ${days} day(s) of ${leaveType.name} leave`, '/leave/approvals');
  return leave.populate('leaveType', 'name code');
}

export async function cancelLeave(user, id) {
  const leave = await Leave.findOne({ _id: id, employee: selfEmployeeId(user) });
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (!['pending', 'approved'].includes(leave.status)) throw new ApiError(409, `Leave is already ${leave.status}`);
  if (leave.status === 'approved' && leave.start <= today()) throw new ApiError(409, 'Leave that has already started cannot be cancelled');

  const before = leave.toJSON();
  leave.status = 'cancelled';
  await leave.save();
  await audit(user._id, 'cancel', 'Leave', { before, after: leave });
  return leave;
}

export function listLeaves(user, { status, employee, from, to }) {
  const filter = {};
  const own = scopedEmployeeId(user, employee);
  if (own) filter.employee = own;
  if (status) filter.status = status;
  if (from) filter.end = { $gte: dayFromKey(from) };
  if (to) filter.start = { $lte: dayFromKey(to) };
  return Leave.find(filter)
    .populate('leaveType', 'name code')
    .populate(requesterPopulate('name code department'))
    .sort({ createdAt: -1 })
    .limit(300);
}

export async function reviewLeave(user, id, { approve, comment }) {
  const leave = await Leave.findById(id).populate('leaveType').populate('employee', 'name user');
  if (!leave) throw new ApiError(404, 'Leave request not found');
  if (leave.status !== 'pending') throw new ApiError(409, `Leave is already ${leave.status}`);
  await assertCanReview(user, leave.employee._id);

  if (approve) await assertCanTake(leave.employee._id, leave.leaveType, leave.start, leave.end, leave.days, leave._id);

  const before = leave.toJSON();
  leave.status = approve ? 'approved' : 'rejected';
  leave.reviewedBy = user._id;
  leave.comment = comment;
  await leave.save();

  await audit(user._id, approve ? 'approve' : 'reject', 'Leave', { before, after: leave });
  await notifyUser(
    leave.employee.user,
    `Leave ${leave.status}`,
    `Your ${leave.leaveType.name} leave (${leave.days} day(s)) was ${leave.status}${comment ? `: ${comment}` : ''}`,
    '/leave'
  );
  return leave;
}
