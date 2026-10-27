import { Attendance } from '../../models/Attendance.js';
import { AttendanceCorrection } from '../../models/AttendanceCorrection.js';
import { Employee } from '../../models/Employee.js';
import { Leave } from '../../models/Leave.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { notifyRoles, notifyUser } from '../../utils/notify.js';
import { assertCanReview, requesterPopulate, reviewerRoles, scopedEmployeeId, selfEmployeeId } from '../../utils/scope.js';
import { eachDay, isWorkingDay, today, toDayKey, dayFromKey } from '../../utils/dates.js';
import { getSettings, getHolidayKeys } from '../settings/settings.service.js';
import { computeStatus, distanceMeters, faceDistance, isLate, FACE_MATCH_THRESHOLD } from './attendance.rules.js';

const MAX_GPS_ACCURACY_M = 100;

// Past days that were never checked out become missing_checkout (lazy, so no cron is needed).
// Records only go stale when the day rolls over (check-in is today-only), so once per day per process is enough.
let closedThroughDay;
export async function closeStaleRecords() {
  const key = toDayKey(new Date());
  if (closedThroughDay === key) return;
  await Attendance.updateMany({ date: { $lt: today() }, checkOut: null, status: { $ne: 'missing_checkout' } }, { status: 'missing_checkout' });
  closedThroughDay = key;
}

async function verifyCameraCheckIn(employeeId, settings, { lat, lng, accuracy, faceCount, descriptor, liveness }) {
  if (faceCount !== 1) throw new ApiError(422, faceCount ? 'More than one face detected' : 'No face detected');
  if (!liveness) throw new ApiError(422, 'Liveness check failed: blink once in front of the camera');
  if (accuracy > MAX_GPS_ACCURACY_M) throw new ApiError(422, `GPS accuracy is ${Math.round(accuracy)} m; it must be within ${MAX_GPS_ACCURACY_M} m`);
  const office = settings.officeLocation;
  if (office?.lat == null || office?.lng == null) throw new ApiError(422, 'Office location has not been set by Admin');

  const distance = distanceMeters(office, { lat, lng });
  if (distance > settings.radiusMeters) {
    throw new ApiError(422, `You are ${Math.round(distance)} m from the office; check-in is allowed within ${settings.radiusMeters} m`);
  }

  const employee = await Employee.findById(employeeId).select('+faceDescriptor');
  if (employee.faceDescriptor?.length) {
    if (!descriptor) throw new ApiError(422, 'Face descriptor missing');
    if (faceDistance(employee.faceDescriptor, descriptor) > FACE_MATCH_THRESHOLD) throw new ApiError(422, 'Face does not match the enrolled employee');
  }
  return { lat, lng, accuracy, distance: Math.round(distance), liveness: true };
}

// Server stamps the time; the client only sends location/face data for camera check-in.
export async function checkIn(user, body) {
  const employeeId = selfEmployeeId(user);
  const settings = await getSettings();
  const now = new Date();
  const date = today(now);

  if (await Attendance.exists({ employee: employeeId, date })) throw new ApiError(409, 'Already checked in today');
  const location = body.source === 'camera' ? await verifyCameraCheckIn(employeeId, settings, body) : undefined;

  const employee = await Employee.findById(employeeId, 'department');
  const record = await Attendance.create({
    employee: employeeId,
    department: employee.department,
    date,
    checkIn: now,
    status: isLate(now, settings) ? 'late' : 'present',
    source: body.source,
    location,
  });
  return record;
}

export async function checkOut(user) {
  const employeeId = selfEmployeeId(user);
  const record = await Attendance.findOne({ employee: employeeId, date: today() });
  if (!record) throw new ApiError(404, 'You have not checked in today');
  if (record.checkOut) throw new ApiError(409, 'Already checked out today');

  record.checkOut = new Date();
  record.status = computeStatus(record, await getSettings());
  await record.save();
  return record;
}

export async function enrollFace(user, descriptor) {
  await Employee.updateOne({ _id: selfEmployeeId(user) }, { faceDescriptor: descriptor });
  await audit(user._id, 'enroll_face', 'Employee', { id: user.employee });
}

/* ---------- Day-by-day view shared by calendar, payroll and dashboards ---------- */

// Builds the status of every day in [start, end] for the given employees.
// Day statuses: present | late | half_day | missing_checkout | on_leave | absent | holiday | weekend | not_employed | upcoming | not_checked_in | not_tracked
export async function buildDays(employees, start, end) {
  await closeStaleRecords();
  const [settings, holidayKeys] = await Promise.all([getSettings(), getHolidayKeys(start, end)]);
  const ids = employees.map((e) => e._id);
  // Plain objects (lean): these are read-only and can be thousands of rows for a long period.
  const [records, leaves] = await Promise.all([
    Attendance.find({ employee: { $in: ids }, date: { $gte: start, $lte: end } }, 'employee date status checkIn checkOut source').lean(),
    Leave.find({ employee: { $in: ids }, status: 'approved', start: { $lte: end }, end: { $gte: start } }, 'employee leaveType start end')
      .populate('leaveType', 'code paid')
      .lean(),
  ]);

  const recordMap = new Map(records.map((r) => [`${r.employee}|${r.date.toISOString().slice(0, 10)}`, r]));
  const leavesByEmployee = new Map();
  for (const l of leaves) leavesByEmployee.set(String(l.employee), [...(leavesByEmployee.get(String(l.employee)) || []), l]);
  const todayKey = toDayKey(new Date());
  const result = new Map();

  // The calendar is the same for everyone: work out each day's key and working-day flag once, not per employee.
  const weekend = [...settings.weekend]; // plain array: Mongoose array lookups are slow in this hot loop
  const calendar = [...eachDay(start, end)].map((d) => ({ d, key: d.toISOString().slice(0, 10), workingDay: isWorkingDay(d, weekend, holidayKeys) }));

  for (const emp of employees) {
    const empId = String(emp._id);
    const empLeaves = leavesByEmployee.get(empId) || [];
    const joinKey = emp.joinDate.toISOString().slice(0, 10);
    const exitKey = emp.exitDate?.toISOString().slice(0, 10);
    // Days before the employee was registered in the app had no way to be recorded: paid, never "absent".
    const trackedFromKey = toDayKey(emp.createdAt || new Date(0));
    const days = [];

    for (const { d, key, workingDay } of calendar) {
      const record = recordMap.get(`${empId}|${key}`);
      const leave = empLeaves.length ? empLeaves.find((l) => l.start <= d && l.end >= d) : undefined;
      let status;
      if (key < joinKey || (exitKey && key > exitKey)) status = 'not_employed';
      else if (record) status = record.status;
      else if (!workingDay) status = holidayKeys.has(key) ? 'holiday' : 'weekend';
      else if (leave) status = 'on_leave';
      else if (key > todayKey) status = 'upcoming';
      else if (key === todayKey) status = 'not_checked_in';
      else if (key < trackedFromKey) status = 'not_tracked';
      else status = 'absent';

      days.push({
        date: key,
        workingDay,
        status,
        checkIn: record?.checkIn,
        checkOut: record?.checkOut,
        source: record?.source,
        leaveType: leave?.leaveType?.code,
        unpaidLeave: status === 'on_leave' && leave?.leaveType?.paid === false,
      });
    }
    result.set(empId, days);
  }
  return { result, settings, holidayKeys };
}

// Payroll counts calendar working days only; analytics also count days someone actually worked (e.g. a weekend shift).
export function summarizeDays(days, { payroll = false } = {}) {
  const s = { workingDays: 0, employedDays: 0, present: 0, late: 0, half_day: 0, missing_checkout: 0, absent: 0, on_leave: 0, unpaid_leave: 0, not_tracked: 0, hours: 0 };
  for (const d of days) {
    if (d.checkIn && d.checkOut) s.hours += (new Date(d.checkOut) - new Date(d.checkIn)) / 3600000; // weekend work still counts as hours
    if (!d.workingDay && (payroll || !d.checkIn)) continue;
    s.workingDays++;
    if (d.status === 'not_employed') continue;
    s.employedDays++;
    if (d.status in s) s[d.status]++;
    if (d.unpaidLeave) s.unpaid_leave++;
  }
  s.hours = Math.round(s.hours * 10) / 10;
  return s;
}

export async function getCalendar(user, employeeId, year, month) {
  const id = scopedEmployeeId(user, employeeId) || selfEmployeeId(user);
  const employee = await Employee.findById(id);
  if (!employee) throw new ApiError(404, 'Employee not found');
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const { result } = await buildDays([employee], start, end);
  const days = result.get(String(id));
  return { employee: { _id: employee._id, name: employee.name, code: employee.code }, days, summary: summarizeDays(days) };
}

export async function getToday(user) {
  const record = await Attendance.findOne({ employee: selfEmployeeId(user), date: today() });
  return { date: toDayKey(new Date()), record };
}

// Daily board for HR/Admin: every current employee with their status for the day.
export async function dailyBoard(dateKey, department) {
  const day = dayFromKey(dateKey || toDayKey(new Date()));
  const filter = { joinDate: { $lte: day }, $or: [{ exitDate: null }, { exitDate: { $gte: day } }] };
  if (department) filter.department = department;
  const employees = await Employee.find(filter).populate('department', 'name').sort({ name: 1 });
  const { result } = await buildDays(employees, day, day);

  const rows = employees.map((e) => ({
    employee: { _id: e._id, name: e.name, code: e.code, department: e.department?.name },
    ...result.get(String(e._id))[0],
  }));
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  return { date: day.toISOString().slice(0, 10), counts, rows };
}

/* ---------- Corrections ---------- */

export async function requestCorrection(user, { date, checkIn, checkOut, reason }) {
  const employeeId = selfEmployeeId(user);
  const day = dayFromKey(date);
  if (day > today()) throw new ApiError(422, 'Cannot correct a future date');
  if (toDayKey(checkIn) !== date || toDayKey(checkOut) !== date) throw new ApiError(422, 'Times must be on the corrected date');
  if (checkOut <= checkIn) throw new ApiError(422, 'Check-out must be after check-in');
  if (await AttendanceCorrection.exists({ employee: employeeId, date: day, status: 'pending' })) {
    throw new ApiError(409, 'A correction for this date is already pending');
  }

  const correction = await AttendanceCorrection.create({ employee: employeeId, date: day, checkIn, checkOut, reason });
  await notifyRoles(reviewerRoles(user), 'Attendance correction requested', `${user.name} requested a correction for ${date}`, '/attendance/corrections');
  return correction;
}

export function listCorrections(user, { status }) {
  const filter = {};
  const own = scopedEmployeeId(user);
  if (own) filter.employee = own;
  if (status) filter.status = status;
  return AttendanceCorrection.find(filter).populate(requesterPopulate('name code')).sort({ createdAt: -1 }).limit(200);
}

export async function reviewCorrection(user, id, { approve, comment }) {
  const correction = await AttendanceCorrection.findById(id).populate('employee', 'name user department');
  if (!correction) throw new ApiError(404, 'Correction not found');
  if (correction.status !== 'pending') throw new ApiError(409, `Correction already ${correction.status}`);
  await assertCanReview(user, correction.employee._id);

  correction.status = approve ? 'approved' : 'rejected';
  correction.reviewedBy = user._id;
  correction.comment = comment;
  await correction.save();

  if (approve) {
    const settings = await getSettings();
    const before = await Attendance.findOne({ employee: correction.employee._id, date: correction.date });
    const after = await Attendance.findOneAndUpdate(
      { employee: correction.employee._id, date: correction.date },
      {
        checkIn: correction.checkIn,
        checkOut: correction.checkOut,
        status: computeStatus(correction, settings),
        source: 'correction',
        department: correction.employee.department,
      },
      { upsert: true, returnDocument: 'after' }
    );
    await audit(user._id, 'update', 'Attendance', { before, after });
  }
  await audit(user._id, approve ? 'approve' : 'reject', 'AttendanceCorrection', { after: correction });
  await notifyUser(
    correction.employee.user,
    `Attendance correction ${correction.status}`,
    `Your correction for ${correction.date.toISOString().slice(0, 10)} was ${correction.status}${comment ? `: ${comment}` : ''}`,
    '/attendance'
  );
  return correction;
}
