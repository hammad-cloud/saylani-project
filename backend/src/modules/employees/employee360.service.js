import { Leave } from '../../models/Leave.js';
import { Payslip } from '../../models/Payslip.js';
import { scopedEmployeeId, selfEmployeeId } from '../../utils/scope.js';
import { today } from '../../utils/dates.js';
import { getEmployee } from './employees.service.js';
import { getBalances } from '../leave/leave.service.js';
import { buildDays, summarizeDays } from '../attendance/attendance.service.js';

// Employee 360: profile + this month's attendance + leave balance/history + payslips, all in the caller's scope.
export async function getEmployee360(user, id) {
  const employeeId = scopedEmployeeId(user, id) || selfEmployeeId(user);
  const employee = await getEmployee(user, employeeId);

  const now = today();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const { result } = await buildDays([employee], monthStart, now);

  const [balances, leaves, payslips] = await Promise.all([
    getBalances(employee._id),
    Leave.find({ employee: employee._id }).populate('leaveType', 'name code').sort({ start: -1 }).limit(10),
    Payslip.find({ employee: employee._id, ...(user.role === 'employee' && { finalized: true }) }).sort({ year: -1, month: -1 }).limit(12),
  ]);

  return {
    employee,
    attendanceThisMonth: summarizeDays(result.get(String(employee._id)).filter((d) => d.status !== 'not_checked_in')),
    leaveBalances: balances,
    recentLeaves: leaves,
    payslips,
  };
}
