// Load and stress check: seeds a throwaway database with a realistic company, then measures the heaviest
// endpoints at rising concurrency. Never touches the app's real data (uses <TEST_MONGO_URI>-load, dropped after).
// Usage: npm run load            (EMPLOYEES=200 DAYS=90 LEVELS=1,10,50 to change the shape)
// Note: client and server share one Node process here, so absolute numbers are pessimistic; compare runs.
import mongoose from 'mongoose';
import { start, stop, call, login } from '../tests/helpers.js';
import { toDayKey, dayFromKey } from '../src/utils/dates.js';

const EMPLOYEES = Number(process.env.EMPLOYEES) || 200;
const DAYS = Number(process.env.DAYS) || 90;
const LEVELS = (process.env.LEVELS || '1,10,50').split(',').map(Number);

if (!(await start('-load'))) {
  console.error('MongoDB not reachable (docker compose up -d)');
  process.exit(1);
}

/* ---------- Seed: departments, employees, ~DAYS of attendance, some leave ---------- */

const t0 = Date.now();
await call('POST', '/setup', null, { companyName: 'Load Co', adminName: 'Ada Admin', adminEmail: 'admin@load.co', adminPassword: 'admin1234' });
const admin = await login('admin@load.co', 'admin1234');
const { Department, Employee, Attendance, Leave, LeaveType, User } = mongoose.models;

const depts = await Department.insertMany(['Engineering', 'Sales', 'Finance', 'Operations', 'Support'].map((name) => ({ name })));
const hrUser = await User.create({ name: 'Hina HR', email: 'hr@load.co', password: 'hrpass123', role: 'hr' });
const hr = await login('hr@load.co', 'hrpass123');

// Deterministic pseudo-random so every run seeds the same company.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const todayKey = toDayKey(new Date());
const first = new Date(dayFromKey(todayKey).getTime() - DAYS * 86400000);
const employees = await Employee.insertMany(
  Array.from({ length: EMPLOYEES }, (_, i) => ({
    code: `L${String(i + 1).padStart(4, '0')}`,
    name: `Employee ${i + 1}`,
    email: `e${i + 1}@load.co`,
    gender: rand() < 0.5 ? 'male' : 'female',
    department: depts[i % depts.length]._id,
    joinDate: new Date(first.getTime() - Math.floor(rand() * 1000) * 86400000),
    basicSalary: 50000 + Math.floor(rand() * 150000),
  }))
);
// Registered before the period starts, so earlier days count as tracked.
await Employee.updateMany({}, { createdAt: first }, { timestamps: false });

const at = (day, h, m) => new Date(day.getTime() + ((h - 5) * 60 + m) * 60000); // PKT → UTC
const records = [];
for (let d = new Date(first); toDayKey(d) < todayKey; d = new Date(d.getTime() + 86400000)) {
  if ([0, 6].includes(d.getUTCDay())) continue;
  for (const e of employees) {
    const r = rand();
    if (r < 0.06) continue; // absent
    const late = r > 0.85;
    const checkIn = at(d, 9, late ? 20 + Math.floor(rand() * 40) : Math.floor(rand() * 14));
    const half = r > 0.97;
    records.push({
      employee: e._id,
      department: e.department,
      date: d,
      checkIn,
      checkOut: new Date(checkIn.getTime() + (half ? 4 : 9) * 3600000),
      status: half ? 'half_day' : late ? 'late' : 'present',
      source: 'web',
    });
  }
}
await Attendance.insertMany(records);

const types = await LeaveType.find();
const leaves = employees.filter(() => rand() < 0.3).map((e) => {
  const start = new Date(first.getTime() + Math.floor(rand() * DAYS) * 86400000);
  return { employee: e._id, department: e.department, leaveType: types[Math.floor(rand() * types.length)]._id, start, end: start, days: 1, status: 'approved', reviewedBy: hrUser._id };
});
await Leave.insertMany(leaves);
console.log(`Seeded ${EMPLOYEES} employees, ${records.length} attendance records, ${leaves.length} leaves in ${Date.now() - t0} ms\n`);

/* ---------- Measure ---------- */

let lastError;
const pctl = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function measure(label, token, method, path, concurrency, total = Math.max(20, concurrency * 3)) {
  const times = [];
  let errors = 0;
  let next = 0;
  const started = Date.now();
  const worker = async () => {
    while (next < total) {
      const i = next++;
      const s = performance.now();
      try {
        const r = await call(method, typeof path === 'function' ? path(i) : path, token);
        if (r.status >= 400) {
          errors++;
          lastError = `HTTP ${r.status} ${r.body?.message || ''}`;
        }
      } catch (err) {
        errors++; // network-level failure (reset, refused)
        lastError = err.cause?.code || err.message;
      }
      times.push(performance.now() - s);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const secs = (Date.now() - started) / 1000;
  times.sort((a, b) => a - b);
  const row = { endpoint: label, conc: concurrency, reqs: total, 'p50 ms': Math.round(pctl(times, 50)), 'p95 ms': Math.round(pctl(times, 95)), 'max ms': Math.round(times.at(-1)), 'req/s': Math.round((total / secs) * 10) / 10, errors };
  console.log(`  ${label} x${concurrency}: p50 ${row['p50 ms']} ms, errors ${errors}${errors && lastError ? ` (${lastError})` : ''}`);
  return row;
}

const monthStart = `${todayKey.slice(0, 8)}01`;
const quarterFrom = toDayKey(new Date(dayFromKey(todayKey).getTime() - (DAYS - 1) * 86400000));
const reads = [
  ['HR dashboard (month)', hr, 'GET', '/analytics/hr'],
  [`HR dashboard (${DAYS} days)`, hr, 'GET', `/analytics/hr?from=${quarterFrom}&to=${todayKey}`],
  ['Admin dashboard', admin, 'GET', '/analytics/admin'],
  ['Attendance board', hr, 'GET', '/attendance/board'],
  ['Employee search', hr, 'GET', '/employees?search=Employee%201'],
];

// SNAPSHOT=file.json: save each endpoint's answer once and stop (to prove an optimization changes no numbers).
if (process.env.SNAPSHOT) {
  const { writeFileSync } = await import('node:fs');
  const snap = {};
  for (const [label, token, method, path] of reads) snap[label] = (await call(method, path, token)).body;
  const [y, m] = todayKey.split('-').map(Number);
  const run = (await call('POST', '/payroll/runs', hr, { year: y, month: m })).body;
  snap.payroll = (await call('GET', `/payroll/runs/${run._id}`, hr)).body.payslips.map(({ _id, run: _r, createdAt, updatedAt, ...p }) => p);
  // Ids and timestamps differ per run; everything else must match.
  writeFileSync(process.env.SNAPSHOT, JSON.stringify(snap, (k, v) => (['_id', 'createdAt', 'updatedAt', 'auditFeed'].includes(k) ? undefined : v), 2));
  console.log(`Snapshot written to ${process.env.SNAPSHOT}`);
  await stop();
  process.exit(0);
}

const rows = [];
for (const [label, token, method, path] of reads) {
  for (const c of LEVELS) rows.push(await measure(label, token, method, path, c));
}

// Payroll is a write that recomputes the whole month: measured one at a time, as HR would run it.
const [y, m] = todayKey.split('-').map(Number);
const payrollTimes = [];
for (let i = 0; i < 3; i++) {
  const s = performance.now();
  const r = await call('POST', '/payroll/runs', hr, { year: y, month: m });
  if (r.status >= 400) throw new Error(`payroll failed: ${JSON.stringify(r.body)}`);
  payrollTimes.push(Math.round(performance.now() - s));
}
rows.push({ endpoint: 'Payroll draft (recompute)', conc: 1, reqs: 3, 'p50 ms': payrollTimes.sort((a, b) => a - b)[1], 'p95 ms': payrollTimes[2], 'max ms': payrollTimes[2], 'req/s': '-', errors: 0 });

// Stress: well past expected use (a whole office refreshing at once) - must degrade, not fail.
const stress = await measure(`STRESS HR dashboard (${DAYS} days)`, hr, 'GET', `/analytics/hr?from=${quarterFrom}&to=${todayKey}`, 100, 200);
rows.push(stress);
// Same load, but every request asks for a different department and period, so no two can share work.
const mixed = (i) => `/analytics/hr?department=${depts[i % depts.length]._id}&from=${toDayKey(new Date(dayFromKey(quarterFrom).getTime() + (i % 40) * 86400000))}&to=${todayKey}`;
const stressMixed = await measure('STRESS HR dashboard (mixed filters)', hr, 'GET', mixed, 100, 200);
rows.push(stressMixed);

console.table(rows);
console.log(`Peak memory (RSS): ${Math.round(process.memoryUsage().rss / 1048576)} MB`);
await stop();
process.exit(stress.errors || stressMixed.errors ? 1 : 0);
