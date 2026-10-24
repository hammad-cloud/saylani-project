import mongoose from 'mongoose';
import { Employee } from '../../models/Employee.js';
import { Attendance } from '../../models/Attendance.js';
import { Leave } from '../../models/Leave.js';
import { LeaveType } from '../../models/LeaveType.js';
import { Payslip } from '../../models/Payslip.js';
import { PayrollRun } from '../../models/PayrollRun.js';
import { AttendanceCorrection } from '../../models/AttendanceCorrection.js';
import { AuditLog } from '../../models/AuditLog.js';
import { Announcement } from '../../models/Announcement.js';
import { dayFromKey, toDayKey, today } from '../../utils/dates.js';
import { buildDays, summarizeDays, closeStaleRecords } from '../attendance/attendance.service.js';
import { getBalances } from '../leave/leave.service.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : 0);

// Normalises { from, to, department, employee } filters. Defaults to the current month up to today.
export function resolveFilters({ from, to, department, employee } = {}) {
  const now = today();
  const start = from ? dayFromKey(from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = to ? dayFromKey(to) : now;
  return { start, end, department: department || null, employee: employee || null };
}

const employedFilter = (start, end, { department, employee }) => ({
  joinDate: { $lte: end },
  $or: [{ exitDate: null }, { exitDate: { $gte: start } }],
  ...(department && { department: oid(department) }),
  ...(employee && { _id: oid(employee) }),
});

/* ---------- Headcount & attrition ---------- */

export async function getHeadcount(f) {
  const { end, department } = resolveFilters(f);
  const match = { status: { $in: ['active', 'probation'] }, joinDate: { $lte: end }, ...(department && { department: oid(department) }) };
  const byDept = await Employee.aggregate([
    { $match: match },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
    { $project: { _id: 0, departmentId: '$_id', department: { $ifNull: [{ $first: '$dept.name' }, 'Unassigned'] }, count: 1 } },
    { $sort: { count: -1 } },
  ]);
  return { total: byDept.reduce((t, d) => t + d.count, 0), byDepartment: byDept };
}

export async function getAttrition(f) {
  const { start, end, department } = resolveFilters(f);
  const dept = department ? { department: oid(department) } : {};
  const activeAt = (d) => Employee.countDocuments({ ...dept, joinDate: { $lte: d }, $or: [{ exitDate: null }, { exitDate: { $gt: d } }] });
  const [atStart, atEnd, exits] = await Promise.all([
    activeAt(start),
    activeAt(end),
    Employee.countDocuments({ ...dept, exitDate: { $gte: start, $lte: end } }),
  ]);
  const avg = (atStart + atEnd) / 2;
  return { exits, averageHeadcount: avg, attritionRate: pct(exits, avg) };
}

export async function getDemographics(f) {
  const { department } = resolveFilters(f);
  const match = { status: { $in: ['active', 'probation'] }, ...(department && { department: oid(department) }) };
  const employees = await Employee.find(match, 'gender joinDate');
  const gender = {};
  const tenure = { '< 1 year': 0, '1-3 years': 0, '3-5 years': 0, '5+ years': 0 };
  for (const e of employees) {
    gender[e.gender || 'unspecified'] = (gender[e.gender || 'unspecified'] || 0) + 1;
    const years = (Date.now() - e.joinDate) / (365.25 * 86400000);
    tenure[years < 1 ? '< 1 year' : years < 3 ? '1-3 years' : years < 5 ? '3-5 years' : '5+ years']++;
  }
  return { gender, tenure };
}

/* ---------- Attendance ---------- */

// Attendance rate = (present + late + missing_checkout + 0.5 × half_day) ÷ (working-day records − on_leave)
export async function getAttendanceSummary(f) {
  const { start, end, department, employee } = resolveFilters(f);
  const employees = await Employee.find(employedFilter(start, end, { department, employee })).populate('department', 'name');
  const { result } = await buildDays(employees, start, end);

  const total = summarizeDays([]);
  const byDept = new Map();
  const trend = new Map();
  for (const emp of employees) {
    const days = result.get(String(emp._id)).filter((d) => !['upcoming'].includes(d.status));
    const s = summarizeDays(days.filter((d) => d.status !== 'not_checked_in'));
    for (const k of Object.keys(total)) total[k] += s[k];

    const name = emp.department?.name || 'Unassigned';
    const d = byDept.get(name) || summarizeDays([]);
    for (const k of Object.keys(d)) d[k] += s[k];
    byDept.set(name, d);

    for (const day of days) {
      if ((!day.workingDay && !day.checkIn) || ['not_employed', 'not_checked_in', 'not_tracked'].includes(day.status)) continue;
      const t = trend.get(day.date) || { date: day.date, attended: 0, expected: 0 };
      if (day.status !== 'on_leave') t.expected++;
      if (['present', 'late', 'missing_checkout'].includes(day.status)) t.attended++;
      if (day.status === 'half_day') t.attended += 0.5;
      trend.set(day.date, t);
    }
  }

  const rate = (s) => pct(s.present + s.late + s.missing_checkout + 0.5 * s.half_day, s.employedDays - s.not_tracked - s.on_leave);
  return {
    period: { from: toDayKey(start), to: toDayKey(end) },
    employees: employees.length,
    counts: { present: total.present, late: total.late, half_day: total.half_day, missing_checkout: total.missing_checkout, absent: total.absent, on_leave: total.on_leave },
    attendanceRate: rate(total),
    latePercent: pct(total.late, total.present + total.late),
    absenteeism: pct(total.absent, total.employedDays - total.not_tracked),
    byDepartment: [...byDept].map(([name, s]) => ({
      department: name,
      attendanceRate: rate(s),
      latePercent: pct(s.late, s.present + s.late),
      absenteeism: pct(s.absent, s.employedDays - s.not_tracked),
      absent: s.absent,
      late: s.late,
    })),
    trend: [...trend.values()].sort((a, b) => a.date.localeCompare(b.date)).map((t) => ({ date: t.date, rate: pct(t.attended, t.expected) })),
  };
}

export async function getLateComers(f, limit = 5) {
  const { start, end, department, employee } = resolveFilters(f);
  await closeStaleRecords();
  return Attendance.aggregate([
    { $match: { status: 'late', date: { $gte: start, $lte: end }, ...(department && { department: oid(department) }), ...(employee && { employee: oid(employee) }) } },
    { $group: { _id: '$employee', lateCount: { $sum: 1 } } },
    { $sort: { lateCount: -1 } },
    { $limit: limit },
    { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'emp' } },
    { $project: { _id: 0, employeeId: '$_id', name: { $first: '$emp.name' }, code: { $first: '$emp.code' }, lateCount: 1 } },
  ]);
}

/* ---------- Leave ---------- */

export async function getLeaveSummary(f) {
  const { start, end, department, employee } = resolveFilters(f);
  const scope = { ...(department && { department: oid(department) }), ...(employee && { employee: oid(employee) }) };
  const dayKey = today();

  const [byType, onLeaveToday, pending, types, headcount] = await Promise.all([
    Leave.aggregate([
      { $match: { ...scope, status: 'approved', start: { $lte: end }, end: { $gte: start } } },
      { $group: { _id: '$leaveType', days: { $sum: '$days' }, requests: { $sum: 1 } } },
      { $lookup: { from: 'leavetypes', localField: '_id', foreignField: '_id', as: 't' } },
      { $project: { _id: 0, leaveType: { $first: '$t.name' }, code: { $first: '$t.code' }, quota: { $first: '$t.yearlyQuota' }, days: 1, requests: 1 } },
    ]),
    Leave.find({ ...scope, status: 'approved', start: { $lte: dayKey }, end: { $gte: dayKey } })
      .populate('employee', 'name code')
      .populate('leaveType', 'name code'),
    Leave.countDocuments({ ...scope, status: 'pending' }),
    LeaveType.find(),
    Employee.countDocuments(employedFilter(start, end, { department, employee })),
  ]);

  // Utilization = approved days ÷ total quota available to the people in scope.
  const utilization = byType.map((t) => ({ ...t, utilization: t.quota ? pct(t.days, t.quota * headcount) : null }));
  for (const t of types) if (!utilization.some((u) => u.code === t.code)) utilization.push({ leaveType: t.name, code: t.code, days: 0, requests: 0, quota: t.yearlyQuota, utilization: t.yearlyQuota ? 0 : null });

  return {
    period: { from: toDayKey(start), to: toDayKey(end) },
    byType: utilization,
    pendingRequests: pending,
    onLeaveToday: onLeaveToday.map((l) => ({ name: l.employee?.name, code: l.employee?.code, type: l.leaveType?.name, until: toDayKey(l.end) })),
  };
}

/* ---------- Payroll ---------- */

export async function getPayrollSummary(f) {
  const { start, end, department, employee } = resolveFilters(f);
  const months = [];
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth() + 1; y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth() + 1); m === 12 ? (y++, (m = 1)) : m++) {
    months.push({ year: y, month: m });
  }
  const match = { $or: months.length ? months : [{ year: -1 }], ...(department && { department: oid(department) }), ...(employee && { employee: oid(employee) }) };

  const [byMonth, byDept, byDesignation, runs] = await Promise.all([
    Payslip.aggregate([
      { $match: match },
      { $group: { _id: { year: '$year', month: '$month' }, gross: { $sum: '$proratedGross' }, net: { $sum: '$net' }, tax: { $sum: '$tax' }, employees: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Payslip.aggregate([
      { $match: match },
      { $group: { _id: '$department', gross: { $sum: '$proratedGross' }, net: { $sum: '$net' }, avgGross: { $avg: '$gross' } } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
      { $project: { _id: 0, department: { $ifNull: [{ $first: '$d.name' }, 'Unassigned'] }, gross: { $round: ['$gross', 2] }, net: { $round: ['$net', 2] }, avgGross: { $round: ['$avgGross', 2] } } },
      { $sort: { gross: -1 } },
    ]),
    Payslip.aggregate([
      { $match: match },
      { $group: { _id: '$designation', avgGross: { $avg: '$gross' }, employees: { $addToSet: '$employee' } } },
      { $lookup: { from: 'designations', localField: '_id', foreignField: '_id', as: 'd' } },
      { $project: { _id: 0, designation: { $ifNull: [{ $first: '$d.name' }, 'Unassigned'] }, avgGross: { $round: ['$avgGross', 2] }, employees: { $size: '$employees' } } },
    ]),
    PayrollRun.find({ $or: months.length ? months : [{ year: -1 }] }, 'year month status'),
  ]);

  const totalGross = byMonth.reduce((t, m) => t + m.gross, 0);
  const slipCount = byMonth.reduce((t, m) => t + m.employees, 0);
  return {
    period: { from: toDayKey(start), to: toDayKey(end) },
    totalGross: Math.round(totalGross * 100) / 100,
    totalNet: Math.round(byMonth.reduce((t, m) => t + m.net, 0) * 100) / 100,
    averageGross: slipCount ? Math.round((totalGross / slipCount) * 100) / 100 : 0,
    runs: runs.map((r) => ({ month: `${r.year}-${String(r.month).padStart(2, '0')}`, status: r.status })),
    byMonth: byMonth.map((m) => ({ month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`, gross: Math.round(m.gross * 100) / 100, net: Math.round(m.net * 100) / 100, employees: m.employees })),
    byDepartment: byDept,
    byDesignation,
  };
}

/* ---------- Bonus insights: absence anomalies & attrition risk ---------- */

// Flags employees whose absence in the period is well above the team's average (z-score > 1.5) or who are absent on Mondays/Fridays a lot.
export async function getInsights(f) {
  const { start, end, department } = resolveFilters(f);
  const employees = await Employee.find(employedFilter(start, end, { department }));
  if (!employees.length) return { anomalies: [], attritionRisk: [] };
  const { result } = await buildDays(employees, start, end);

  const stats = employees.map((e) => {
    const days = result.get(String(e._id));
    const s = summarizeDays(days.filter((d) => !['upcoming', 'not_checked_in'].includes(d.status)));
    const edgeAbsences = days.filter((d) => d.status === 'absent' && [1, 5].includes(new Date(d.date).getUTCDay())).length;
    return { e, s, absRate: s.employedDays - s.not_tracked ? s.absent / (s.employedDays - s.not_tracked) : 0, lateRate: s.present + s.late ? s.late / (s.present + s.late) : 0, edgeAbsences };
  });

  const mean = stats.reduce((t, x) => t + x.absRate, 0) / stats.length;
  const sd = Math.sqrt(stats.reduce((t, x) => t + (x.absRate - mean) ** 2, 0) / stats.length) || 0;

  const anomalies = stats
    .filter((x) => (sd && (x.absRate - mean) / sd > 1.5 && x.s.absent >= 2) || x.edgeAbsences >= 2)
    .map((x) => ({
      name: x.e.name,
      code: x.e.code,
      absent: x.s.absent,
      reason: x.edgeAbsences >= 2 ? `${x.edgeAbsences} absences on Mondays/Fridays` : `absence ${Math.round(x.absRate * 100)}% vs team ${Math.round(mean * 100)}%`,
    }));

  // Simple explainable score 0-100 from absence, lateness, tenure and probation.
  const attritionRisk = stats
    .map((x) => {
      const tenureYears = (Date.now() - x.e.joinDate) / (365.25 * 86400000);
      const score = Math.min(100, Math.round(x.absRate * 200 + x.lateRate * 60 + (tenureYears < 1 ? 15 : 0) + (x.e.status === 'probation' ? 10 : 0)));
      const factors = [];
      if (x.absRate > 0.1) factors.push('high absence');
      if (x.lateRate > 0.3) factors.push('frequent late arrivals');
      if (tenureYears < 1) factors.push('tenure under 1 year');
      if (x.e.status === 'probation') factors.push('on probation');
      return { name: x.e.name, code: x.e.code, score, level: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low', factors };
    })
    .filter((r) => r.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return { anomalies, attritionRisk };
}

/* ---------- Role dashboards ---------- */

export async function hrDashboard(f) {
  const todayKey = toDayKey(new Date());
  const [headcount, todaySummary, attendance, leave, lateComers, pendingCorrections, insights] = await Promise.all([
    getHeadcount(f),
    getAttendanceSummary({ ...f, from: todayKey, to: todayKey }),
    getAttendanceSummary(f),
    getLeaveSummary(f),
    getLateComers(f, 5),
    AttendanceCorrection.countDocuments({ status: 'pending' }),
    getInsights(f),
  ]);
  return {
    kpis: {
      headcount: headcount.total,
      presentToday: todaySummary.counts.present + todaySummary.counts.late + todaySummary.counts.missing_checkout + todaySummary.counts.half_day,
      onLeaveToday: leave.onLeaveToday.length,
      lateToday: todaySummary.counts.late,
      pendingApprovals: leave.pendingRequests + pendingCorrections,
      attendanceRate: attendance.attendanceRate,
    },
    attendanceTrend: attendance.trend,
    absenteeismByDepartment: attendance.byDepartment,
    leaveByType: leave.byType,
    onLeaveToday: leave.onLeaveToday,
    topLateComers: lateComers,
    insights,
  };
}

export async function adminDashboard(f) {
  const { start, end } = resolveFilters(f);
  const ytd = { ...f, from: `${end.getUTCFullYear()}-01-01`, to: toDayKey(end) };
  const [headcount, attrition, payroll, demographics, auditFeed] = await Promise.all([
    getHeadcount(f),
    getAttrition(ytd),
    getPayrollSummary({ ...f, from: toDayKey(start), to: toDayKey(end) }),
    getDemographics(f),
    AuditLog.find().populate('actor', 'name role').sort({ createdAt: -1 }).limit(8),
  ]);
  return {
    kpis: {
      headcount: headcount.total,
      attritionYtd: attrition.attritionRate,
      exitsYtd: attrition.exits,
      payrollCost: payroll.totalGross,
      averageSalary: payroll.averageGross,
    },
    headcountByDepartment: headcount.byDepartment,
    payrollByDepartment: payroll.byDepartment,
    payrollByMonth: payroll.byMonth,
    demographics,
    auditFeed,
  };
}

export async function employeeDashboard(user) {
  const employeeId = user.employee;
  const now = today();
  const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(now.getTime() - dow * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const employee = await Employee.findById(employeeId);
  const { result } = await buildDays([employee], monthStart < weekStart ? monthStart : weekStart, now);
  const days = result.get(String(employeeId));
  const week = summarizeDays(days.filter((d) => d.date >= toDayKey(weekStart)));
  const month = summarizeDays(days.filter((d) => d.date >= toDayKey(monthStart)));

  const [todayRecord, balances, lastPayslip, announcements] = await Promise.all([
    Attendance.findOne({ employee: employeeId, date: now }),
    getBalances(employeeId),
    Payslip.findOne({ employee: employeeId, finalized: true }).sort({ year: -1, month: -1 }),
    Announcement.find().populate('author', 'name role').sort({ createdAt: -1 }).limit(5),
  ]);

  return {
    today: todayRecord,
    hoursThisWeek: week.hours,
    weeklyTarget: 40,
    lateThisMonth: month.late,
    absentThisMonth: month.absent,
    leaveBalances: balances,
    lastPayslip,
    announcements,
  };
}
