import PDFDocument from 'pdfkit';
import { PayrollRun } from '../../models/PayrollRun.js';
import { Payslip } from '../../models/Payslip.js';
import { Employee } from '../../models/Employee.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { notifyUser } from '../../utils/notify.js';
import { scopedEmployeeId } from '../../utils/scope.js';
import { monthRange } from '../../utils/dates.js';
import { buildDays, summarizeDays } from '../attendance/attendance.service.js';
import { getSettings } from '../settings/settings.service.js';
import { computePayslip } from './payroll.rules.js';

const LATES_PER_PENALTY = 3; // bonus rule: every 3 lates = 0.5 day deducted

// Creates or recomputes the month's draft from attendance and approved leave. Finalized runs are locked.
export async function generateDraft(user, year, month) {
  const existing = await PayrollRun.findOne({ year, month });
  if (existing?.status === 'finalized') throw new ApiError(409, 'This month is finalized and locked');

  const { start, end } = monthRange(year, month);
  const employees = await Employee.find({ joinDate: { $lte: end }, $or: [{ exitDate: null }, { exitDate: { $gte: start } }] });
  if (!employees.length) throw new ApiError(422, 'No employees were employed in this month');

  const { result } = await buildDays(employees, start, end);
  const run = existing || new PayrollRun({ year, month, createdBy: user._id });

  const slips = employees.map((emp) => {
    const s = summarizeDays(result.get(String(emp._id)), { payroll: true });
    const latePenaltyDays = Math.floor(s.late / LATES_PER_PENALTY) * 0.5;
    const pay = computePayslip({
      basic: emp.basicSalary,
      workingDays: s.workingDays,
      employedDays: s.employedDays,
      absentDays: s.absent,
      unpaidLeaveDays: s.unpaid_leave,
      halfDays: s.half_day,
      latePenaltyDays,
    });
    return {
      run: run._id,
      employee: emp._id,
      department: emp.department,
      designation: emp.designation,
      year,
      month,
      ...pay,
      attendance: {
        workingDays: s.workingDays,
        employedDays: s.employedDays,
        present: s.present + s.missing_checkout,
        late: s.late,
        halfDays: s.half_day,
        absent: s.absent,
        paidLeave: s.on_leave - s.unpaid_leave,
        unpaidLeave: s.unpaid_leave,
        latePenaltyDays,
      },
    };
  });

  const sum = (k) => Math.round(slips.reduce((t, p) => t + p[k], 0) * 100) / 100;
  run.workingDays = slips[0].attendance.workingDays;
  run.totals = { employees: slips.length, gross: sum('proratedGross'), deductions: sum('attendanceDeduction'), tax: sum('tax'), net: sum('net') };
  await run.save();
  await Payslip.deleteMany({ run: run._id });
  await Payslip.insertMany(slips);

  await audit(user._id, existing ? 'recompute' : 'create', 'PayrollRun', { after: run });
  return run;
}

export const listRuns = () => PayrollRun.find().sort({ year: -1, month: -1 });

export async function getRun(id) {
  const run = await PayrollRun.findById(id);
  if (!run) throw new ApiError(404, 'Payroll run not found');
  const payslips = await Payslip.find({ run: id })
    .populate('employee', 'name code')
    .populate('department', 'name')
    .sort({ net: -1 });
  return { run, payslips };
}

export async function finalizeRun(user, id) {
  const run = await PayrollRun.findById(id);
  if (!run) throw new ApiError(404, 'Payroll run not found');
  if (run.status === 'finalized') throw new ApiError(409, 'Payroll run is already finalized');

  const before = run.toJSON();
  run.status = 'finalized';
  run.finalizedBy = user._id;
  run.finalizedAt = new Date();
  await run.save();
  await Payslip.updateMany({ run: run._id }, { finalized: true });
  await audit(user._id, 'finalize', 'PayrollRun', { before, after: run });

  const slips = await Payslip.find({ run: run._id }).populate('employee', 'user');
  const label = `${run.year}-${String(run.month).padStart(2, '0')}`;
  await Promise.all(slips.map((s) => notifyUser(s.employee.user, 'Payslip available', `Your payslip for ${label} is ready to download`, '/payslips')));
  return run;
}

// Employees only ever see finalized payslips of their own.
export function listPayslips(user, { employee, year, month }) {
  const filter = {};
  const own = scopedEmployeeId(user, employee);
  if (own) filter.employee = own;
  if (user.role === 'employee') filter.finalized = true;
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);
  return Payslip.find(filter).populate('employee', 'name code').sort({ year: -1, month: -1 }).limit(200);
}

export async function getPayslip(user, id) {
  const slip = await Payslip.findById(id)
    .populate('employee', 'name code email joinDate')
    .populate('department', 'name')
    .populate('designation', 'name');
  if (!slip) throw new ApiError(404, 'Payslip not found');
  scopedEmployeeId(user, slip.employee._id);
  if (user.role === 'employee' && !slip.finalized) throw new ApiError(404, 'Payslip not found');
  return slip;
}

const money = (n) => `PKR ${Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function streamPayslipPdf(user, id, res) {
  const slip = await getPayslip(user, id);
  const settings = await getSettings();
  const period = new Date(Date.UTC(slip.year, slip.month - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${slip.employee.code}-${slip.year}-${String(slip.month).padStart(2, '0')}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 90).fill('#1e2a44');
  doc.fill('#ffffff').fontSize(20).text(settings.companyName, 50, 30);
  doc.fontSize(11).text(`Payslip · ${period}${slip.finalized ? '' : ' · DRAFT'}`, 50, 58);
  doc.fill('#111111').moveDown(3);

  const row = (label, value, y) => {
    doc.fontSize(10).fill('#555555').text(label, 50, y).fill('#111111').text(value, 300, y, { width: 245, align: 'right' });
  };
  let y = 120;
  for (const [l, v] of [
    ['Employee', `${slip.employee.name} (${slip.employee.code})`],
    ['Department', slip.department?.name || '-'],
    ['Designation', slip.designation?.name || '-'],
    ['Working days / employed days', `${slip.attendance.workingDays} / ${slip.attendance.employedDays}`],
    ['Present / late / half days', `${slip.attendance.present} / ${slip.attendance.late} / ${slip.attendance.halfDays}`],
    ['Absent / unpaid leave / paid leave', `${slip.attendance.absent} / ${slip.attendance.unpaidLeave} / ${slip.attendance.paidLeave}`],
  ]) {
    row(l, v, y);
    y += 18;
  }

  y += 14;
  doc.fontSize(12).fill('#0f9d8a').text('Earnings', 50, y);
  y += 20;
  for (const [l, v] of [
    ['Basic', slip.basic],
    ['House rent allowance (40%)', slip.hra],
    ['Medical allowance (10%)', slip.medical],
    ['Gross (monthly)', slip.gross],
    ['Gross for days employed', slip.proratedGross],
  ]) {
    row(l, money(v), y);
    y += 18;
  }

  y += 14;
  doc.fontSize(12).fill('#c0392b').text('Deductions', 50, y);
  y += 20;
  row(`Attendance (${slip.deductionDays} day(s) × ${money(slip.perDay)})`, money(slip.attendanceDeduction), y);
  y += 18;
  row('Income tax (slab on gross × 12)', money(slip.tax), y);
  y += 30;

  doc.rect(50, y - 6, 495, 30).fill('#eef7f5');
  doc.fill('#111111').fontSize(13).text('Net pay', 60, y + 2).text(money(slip.net), 300, y + 2, { width: 235, align: 'right' });

  doc.fontSize(8).fill('#888888').text('Computer-generated payslip. Tax slabs are illustrative.', 50, 760, { align: 'center', width: 495 });
  doc.end();
}
