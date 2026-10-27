// Phase 3: who reviews whose requests, exit dates, and deleting org records that are still in use.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, stop, call, login, firstLogin, nextWorkingDay } from './helpers.js';
import { toDayKey } from '../src/utils/dates.js';

let mongoOk;
const w = {};

before(async () => {
  mongoOk = await start('-integrity');
  if (!mongoOk) return;

  await call('POST', '/setup', null, { companyName: 'Solo HR Co', adminName: 'Ada Admin', adminEmail: 'admin@int.co', adminPassword: 'admin1234' });
  w.admin = await login('admin@int.co', 'admin1234');
  w.dept = (await call('POST', '/departments', w.admin, { name: 'Engineering' })).body;
  w.desig = (await call('POST', '/designations', w.admin, { name: 'Engineer' })).body;
  w.types = (await call('GET', '/leave-types', w.admin)).body;

  // A company with a single HR officer, who is also on the payroll.
  const hrRes = await call('POST', '/users/hr', w.admin, { name: 'Hina HR', email: 'hr@int.co' });
  w.hr = await firstLogin('hr@int.co', hrRes.body.tempPassword, 'hrpass123');
  const register = (code, name, email, extra = {}) =>
    call('POST', '/employees', w.hr, { code, name, email, department: w.dept._id, joinDate: '2026-01-01', basicSalary: 100000, ...extra });
  w.hrEmp = (await register('H1', 'Hina HR', 'hr@int.co')).body.employee;
  const ali = (await register('E1', 'Ali Ahmed', 'ali@int.co', { designation: w.desig._id })).body;
  w.aliId = ali.employee._id;
  w.ali = await firstLogin('ali@int.co', ali.tempPassword, 'alipass123');
});

after(stop);

const casual = () => w.types.find((t) => t.code === 'casual')._id;

test("single-HR company: Admin reviews the HR officer's leave; HR reviews employees; nobody reviews their own", async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const hrLeave = (await call('POST', '/leaves', w.hr, { leaveType: casual(), start: nextWorkingDay(3), end: nextWorkingDay(3) })).body;
  const aliLeave = (await call('POST', '/leaves', w.ali, { leaveType: casual(), start: nextWorkingDay(5), end: nextWorkingDay(5) })).body;

  // Admin is told about the HR officer's request and sees it is from HR staff.
  assert.ok((await call('GET', '/notifications', w.admin)).body.items.some((n) => n.title === 'New leave request'));
  const inbox = (await call('GET', '/leaves?status=pending', w.admin)).body;
  assert.equal(inbox.find((l) => l._id === hrLeave._id).employee.user.role, 'hr');
  assert.equal(inbox.find((l) => l._id === aliLeave._id).employee.user.role, 'employee');

  assert.equal((await call('PATCH', `/leaves/${hrLeave._id}`, w.hr, { approve: true })).status, 403); // own request
  assert.equal((await call('PATCH', `/leaves/${aliLeave._id}`, w.admin, { approve: true })).status, 403); // not HR staff
  assert.equal((await call('PATCH', `/leaves/${aliLeave._id}`, w.hr, { approve: true })).status, 200);
  assert.equal((await call('PATCH', `/leaves/${hrLeave._id}`, w.admin, { approve: true, comment: 'Enjoy' })).status, 200);
  assert.ok((await call('GET', '/notifications', w.hr)).body.items.some((n) => n.title === 'Leave approved'));
});

test('regression: HR cannot approve their own attendance correction; Admin reviews it instead', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const day = toDayKey(new Date(Date.now() - 86400000));
  const correction = { date: day, checkIn: `${day}T09:00:00+05:00`, checkOut: `${day}T18:00:00+05:00`, reason: 'Forgot to check in' };
  const hrReq = (await call('POST', '/attendance/corrections', w.hr, correction)).body;
  const aliReq = (await call('POST', '/attendance/corrections', w.ali, correction)).body;

  assert.equal((await call('PATCH', `/attendance/corrections/${hrReq._id}`, w.hr, { approve: true })).status, 403);
  assert.equal((await call('PATCH', `/attendance/corrections/${aliReq._id}`, w.admin, { approve: true })).status, 403);
  assert.equal((await call('PATCH', `/attendance/corrections/${aliReq._id}`, w.hr, { approve: true })).status, 200);
  assert.equal((await call('PATCH', `/attendance/corrections/${hrReq._id}`, w.admin, { approve: true })).status, 200);
});

test('regression: org records still in use cannot be deleted; unused ones can', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const used = await call('DELETE', `/departments/${w.dept._id}`, w.admin);
  assert.equal(used.status, 409);
  assert.match(used.body.message, /used by 2 employees/);
  assert.equal((await call('DELETE', `/designations/${w.desig._id}`, w.admin)).status, 409);
  assert.equal((await call('DELETE', `/leave-types/${casual()}`, w.admin)).status, 409); // leave history refers to it

  const spare = (await call('POST', '/departments', w.admin, { name: 'Spare' })).body;
  assert.equal((await call('DELETE', `/departments/${spare._id}`, w.admin)).status, 204);
  const sick = w.types.find((x) => x.code === 'sick')._id;
  assert.equal((await call('DELETE', `/leave-types/${sick}`, w.admin)).status, 204);

  // Leave review still works after the rest of the setup changed.
  assert.equal((await call('GET', '/leaves', w.admin)).status, 200);
});

test('face set-up: several angles of one person; check-in matches the closest angle and refuses a stranger', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  // Synthetic 128-number face fingerprints: angles of one person sit close together, a stranger is far away.
  const face = (changes = {}) => Array.from({ length: 128 }, (_, i) => changes[i] ?? 0);
  const front = face();
  const left = face({ 0: 0.3 });
  const up = face({ 1: 0.45 }); // a far angle: 0.45 from the front
  const stranger = face(Object.fromEntries(Array.from({ length: 128 }, (_, i) => [i, 0.1]))); // ~1.13 away

  assert.equal((await call('GET', '/attendance/today', w.hr)).body.faceEnrolled, false);
  assert.equal((await call('POST', '/attendance/face/enroll', w.hr, { descriptor: front })).status, 422); // old single-photo shape
  const mixed = await call('POST', '/attendance/face/enroll', w.hr, { descriptors: [front, stranger, left] });
  assert.equal(mixed.status, 422);
  assert.match(mixed.body.message, /same person/);
  assert.equal((await call('POST', '/attendance/face/enroll', w.hr, { descriptors: [front, left, up] })).status, 200);
  assert.equal((await call('GET', '/attendance/today', w.hr)).body.faceEnrolled, true);

  await call('PUT', '/settings', w.admin, { officeLocation: { lat: 24.86, lng: 67.0 }, radiusMeters: 150 });
  const camera = (descriptor) => call('POST', '/attendance/check-in', w.hr, { source: 'camera', lat: 24.86, lng: 67.0, accuracy: 20, faceCount: 1, liveness: true, descriptor });
  const refused = await camera(stranger);
  assert.equal(refused.status, 422);
  assert.match(refused.body.message, /does not match/);
  // 0.55 from the front photo (would fail a single-photo match) but 0.1 from the "up" angle: accepted.
  assert.equal((await camera(face({ 1: 0.55 }))).status, 201);
});

test('regression: marking an employee exited without an exit date sets it to today and stops their pay', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const res = await call('PUT', `/employees/${w.aliId}`, w.hr, { status: 'exited' });
  assert.equal(res.status, 200);
  assert.equal(res.body.exitDate.slice(0, 10), toDayKey(new Date()));
  assert.equal((await call('POST', '/auth/login', null, { email: 'ali@int.co', password: 'alipass123' })).status, 403); // login deactivated

  // An exit date that is given is kept as is.
  const given = await call('PUT', `/employees/${w.aliId}`, w.hr, { exitDate: '2026-12-31' });
  assert.equal(given.body.exitDate.slice(0, 10), '2026-12-31');

  // Next month's payroll no longer includes Ali (exited this month), only Hina.
  const next = new Date();
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  await call('PUT', `/employees/${w.aliId}`, w.hr, { exitDate: toDayKey(new Date()) });
  const run = await call('POST', '/payroll/runs', w.hr, { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
  assert.equal(run.status, 201, JSON.stringify(run.body));
  assert.equal(run.body.totals.employees, 1);
});
