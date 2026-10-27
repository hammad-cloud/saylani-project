import { Employee } from '../../models/Employee.js';
import { User } from '../../models/User.js';
import { Department } from '../../models/Department.js';
import { Designation } from '../../models/Designation.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { generateTempPassword } from '../../utils/password.js';
import { toDayKey } from '../../utils/dates.js';
import { escapeRegex, scopedEmployeeId, selfEmployeeId } from '../../utils/scope.js';

const populate = [
  { path: 'department', select: 'name' },
  { path: 'designation', select: 'name' },
];

export async function listEmployees(user, { search, department, status, page = 1, limit = 20 }) {
  const filter = {};
  const own = scopedEmployeeId(user);
  if (own) filter._id = own;
  if (department) filter.department = department;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { code: rx }];
  }

  // _id breaks createdAt ties (e.g. a CSV import) so paging never skips or repeats anyone.
  const [items, total] = await Promise.all([
    Employee.find(filter).populate(populate).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Employee.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}

export async function getEmployee(user, id) {
  const employee = await Employee.findById(scopedEmployeeId(user, id)).populate(populate);
  if (!employee) throw new ApiError(404, 'Employee not found');
  return employee;
}

// Registering an employee also creates their login with a temporary password (changed on first sign-in).
export async function createEmployee(actor, data) {
  const existingUser = await User.findOne({ email: data.email });
  // An HR login without a profile can be registered as an employee (so HR can check in and get paid too).
  if (existingUser && !(existingUser.role === 'hr' && !existingUser.employee)) throw new ApiError(409, 'email already exists');

  const employee = await Employee.create(data);
  if (existingUser) {
    existingUser.employee = employee._id;
    await existingUser.save();
    employee.user = existingUser._id;
    await employee.save();
    await audit(actor._id, 'create', 'Employee', { after: employee });
    return { employee: await employee.populate(populate), tempPassword: null };
  }

  const tempPassword = generateTempPassword();
  try {
    const user = await User.create({
      name: employee.name,
      email: employee.email,
      password: tempPassword,
      role: 'employee',
      mustChangePassword: true,
      employee: employee._id,
    });
    employee.user = user._id;
    await employee.save();
  } catch (err) {
    await Employee.deleteOne({ _id: employee._id }); // keep employee and login in sync
    throw err;
  }

  await audit(actor._id, 'create', 'Employee', { after: employee });
  return { employee: await employee.populate(populate), tempPassword };
}

export async function updateEmployee(actor, id, data) {
  // HR is also an employee: no one edits their own salary, status or job details.
  if (actor.employee && String(actor.employee) === String(id)) {
    throw new ApiError(403, 'You cannot edit your own employee record; ask another HR officer');
  }
  const before = await Employee.findById(id);
  if (!before) throw new ApiError(404, 'Employee not found');
  // Payroll, headcount and the attendance board go by exit date: an exit without one defaults to today.
  if (data.status === 'exited' && !data.exitDate && !before.exitDate) data.exitDate = toDayKey(new Date());
  if (data.email && data.email !== before.email && (await User.exists({ email: data.email }))) {
    throw new ApiError(409, 'email already exists');
  }

  const after = await Employee.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true }).populate(populate);
  await User.updateOne(
    { _id: after.user },
    { name: after.name, email: after.email, ...(data.status && { isActive: after.status !== 'exited' }) }
  );
  await audit(actor._id, 'update', 'Employee', { before, after });
  return after;
}

// Employees (and HR, on their own profile) may edit only their phone and address.
export async function updateOwnContact(user, { phone, address }) {
  const id = selfEmployeeId(user);
  const before = await Employee.findById(id);
  const after = await Employee.findByIdAndUpdate(id, { phone, address }, { returnDocument: 'after', runValidators: true }).populate(populate);
  await audit(user._id, 'update', 'Employee', { before, after });
  return after;
}

/* ---------- CSV import / export ---------- */

export const CSV_COLUMNS = ['code', 'name', 'email', 'phone', 'gender', 'department', 'designation', 'joinDate', 'basicSalary'];
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// Returns { valid: [cleanRow], errors: [{ row, field, reason }] }; row numbers are 1-based data rows (+1 for header).
export async function validateCsvRows(rows) {
  const [departments, designations, existing] = await Promise.all([
    Department.find(),
    Designation.find(),
    Employee.find({}, 'code email'),
  ]);
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d._id]));
  const desigByName = new Map(designations.map((d) => [d.name.toLowerCase(), d._id]));
  const usedCodes = new Set(existing.map((e) => e.code));
  const usedEmails = new Set([...existing.map((e) => e.email), ...(await User.find({}, 'email')).map((u) => u.email)]);

  const valid = [];
  const errors = [];

  rows.forEach((raw, i) => {
    const row = i + 2;
    const r = Object.fromEntries(CSV_COLUMNS.map((c) => [c, String(raw[c] ?? '').trim()]));
    const rowErrors = [];
    const fail = (field, reason) => rowErrors.push({ row, field, reason });

    for (const field of ['code', 'name', 'email', 'department', 'joinDate', 'basicSalary']) {
      if (!r[field]) fail(field, 'required');
    }
    const code = r.code.toUpperCase();
    const email = r.email.toLowerCase();
    if (r.code && usedCodes.has(code)) fail('code', 'duplicate code');
    if (r.email && !EMAIL_RX.test(email)) fail('email', 'invalid email');
    else if (r.email && usedEmails.has(email)) fail('email', 'duplicate email');
    if (r.department && !deptByName.has(r.department.toLowerCase())) fail('department', 'unknown department');
    if (r.designation && !desigByName.has(r.designation.toLowerCase())) fail('designation', 'unknown designation');
    if (r.joinDate && (!ISO_DATE_RX.test(r.joinDate) || isNaN(Date.parse(r.joinDate)))) fail('joinDate', 'must be an ISO date (YYYY-MM-DD)');
    const salary = Number(r.basicSalary);
    if (r.basicSalary && !(salary > 0)) fail('basicSalary', 'must be greater than 0');
    if (r.gender && !['male', 'female', 'other'].includes(r.gender.toLowerCase())) fail('gender', 'must be male, female or other');

    if (rowErrors.length) return errors.push(...rowErrors);
    usedCodes.add(code);
    usedEmails.add(email);
    valid.push({
      code,
      name: r.name,
      email,
      phone: r.phone || undefined,
      gender: r.gender ? r.gender.toLowerCase() : undefined,
      department: deptByName.get(r.department.toLowerCase()),
      designation: r.designation ? desigByName.get(r.designation.toLowerCase()) : undefined,
      joinDate: new Date(r.joinDate),
      basicSalary: salary,
    });
  });

  return { valid, errors };
}

export async function importEmployees(actor, rows, { dryRun }) {
  const { valid, errors } = await validateCsvRows(rows);
  if (dryRun || errors.length) return { dryRun: true, total: rows.length, validCount: valid.length, errors };

  const created = [];
  for (const data of valid) {
    const { employee, tempPassword } = await createEmployee(actor, data);
    created.push({ code: employee.code, email: employee.email, tempPassword });
  }
  return { dryRun: false, total: rows.length, created };
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportEmployeesCsv() {
  const employees = await Employee.find().populate(populate).sort({ code: 1 });
  const header = [...CSV_COLUMNS, 'status'];
  const lines = employees.map((e) =>
    [e.code, e.name, e.email, e.phone, e.gender, e.department?.name, e.designation?.name, e.joinDate?.toISOString().slice(0, 10), e.basicSalary, e.status]
      .map(csvCell)
      .join(',')
  );
  return [header.join(','), ...lines].join('\n');
}
