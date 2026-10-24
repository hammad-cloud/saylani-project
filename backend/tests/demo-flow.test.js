// End-to-end run of the brief's 5-minute demo script against the real API and a throwaway database.
// Needs MongoDB (docker compose up -d); skipped when it is not reachable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/hcm-lite-test';
process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';

let base;
let server;
let mongoOk = true;

before(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 });
  } catch {
    mongoOk = false;
    return;
  }
  await mongoose.connection.dropDatabase();
  await import('../src/models/index.js');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const { app } = await import('../src/app.js');
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  if (mongoOk) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
}

async function login(email, password) {
  const r = await call('POST', '/auth/login', null, { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

// First-login flow: temporary password must be changed before anything else works.
async function firstLogin(email, tempPassword, newPassword) {
  const t = await login(email, tempPassword);
  assert.equal((await call('GET', '/employees/me', t)).status, 403);
  assert.equal((await call('POST', '/auth/change-password', t, { currentPassword: tempPassword, newPassword })).status, 200);
  return login(email, newPassword);
}

// Next working day (Mon-Fri) strictly after today, as YYYY-MM-DD.
function nextWorkingDay(offset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test('demo script: setup → HR → employees → check-in → leave → payroll → RBAC → audit', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');

  // Malformed JSON is a clear 400, not a generic 500.
  const bad = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(bad.status, 400);

  // 1. Fresh install: first-run setup creates company + Admin, and only once.
  assert.equal((await call('GET', '/setup/status')).body.setupComplete, false);
  const setup = { companyName: 'Demo Co', adminName: 'Ada Admin', adminEmail: 'admin@demo.co', adminPassword: 'admin1234' };
  assert.equal((await call('POST', '/setup', null, setup)).status, 201);
  assert.equal((await call('POST', '/setup', null, setup)).status, 409);
  const admin = await login('admin@demo.co', 'admin1234');

  // Admin: settings, department, HR login.
  assert.equal((await call('PUT', '/settings', admin, { officeLocation: { lat: 24.86, lng: 67.0 }, radiusMeters: 150 })).status, 200);
  const dept = (await call('POST', '/departments', admin, { name: 'Engineering' })).body;
  const hrRes = await call('POST', '/users/hr', admin, { name: 'Hina HR', email: 'hr@demo.co' });
  assert.equal(hrRes.status, 201);
  const hr = await firstLogin('hr@demo.co', hrRes.body.tempPassword, 'hrpass123');

  // HR cannot change settings or create admin-only things.
  assert.equal((await call('PUT', '/settings', hr, { graceMinutes: 60 })).status, 403);
  assert.equal((await call('POST', '/users/hr', hr, { name: 'X', email: 'x@demo.co' })).status, 403);

  // 2. HR registers two employees (each gets a login).
  const emp = (code, name, email, basicSalary) =>
    call('POST', '/employees', hr, { code, name, email, department: dept._id, joinDate: '2026-01-01', basicSalary });
  const a = (await emp('E1', 'Ali Ahmed', 'ali@demo.co', 100000)).body;
  const b = (await emp('E2', 'Sara Khan', 'sara@demo.co', 80000)).body;
  assert.ok(a.tempPassword && b.tempPassword);
  assert.equal((await emp('E1', 'Dup', 'dup@demo.co', 1)).status, 409); // unique code

  const ali = await firstLogin('ali@demo.co', a.tempPassword, 'alipass123');

  // Camera check-in is rejected without a blink, with no face, or outside the office radius.
  const cam = { source: 'camera', lat: 24.86, lng: 67.0, accuracy: 20, faceCount: 1, liveness: true };
  assert.match((await call('POST', '/attendance/check-in', ali, { ...cam, liveness: false })).body.message, /Liveness/);
  assert.match((await call('POST', '/attendance/check-in', ali, { ...cam, faceCount: 0 })).body.message, /No face/);
  assert.match((await call('POST', '/attendance/check-in', ali, { ...cam, lat: 24.87 })).body.message, /from the office/);
  assert.match((await call('POST', '/attendance/check-in', ali, { ...cam, accuracy: 500 })).body.message, /GPS accuracy/);

  // Employee checks in; a second check-in the same day is 409.
  assert.equal((await call('POST', '/attendance/check-in', ali, { source: 'web' })).status, 201);
  assert.equal((await call('POST', '/attendance/check-in', ali, { source: 'web' })).status, 409);

  // 3. Employee applies for casual leave; overlap and over-balance are 422; HR approves.
  const types = (await call('GET', '/leave-types', hr)).body;
  const casual = types.find((x) => x.code === 'casual');
  const day = nextWorkingDay();
  const leave = await call('POST', '/leaves', ali, { leaveType: casual._id, start: day, end: day, reason: 'Wedding' });
  assert.equal(leave.status, 201, JSON.stringify(leave.body));
  assert.equal((await call('POST', '/leaves', ali, { leaveType: casual._id, start: day, end: day })).status, 422);
  const far = nextWorkingDay(40);
  const farEnd = new Date(Date.parse(far) + 30 * 86400000).toISOString().slice(0, 10);
  assert.equal((await call('POST', '/leaves', ali, { leaveType: casual._id, start: far, end: farEnd })).status, 422);
  assert.equal((await call('PATCH', `/leaves/${leave.body._id}`, ali, { approve: true })).status, 403); // employee cannot approve
  assert.equal((await call('PATCH', `/leaves/${leave.body._id}`, hr, { approve: true, comment: 'Enjoy' })).status, 200);
  const balance = (await call('GET', '/leaves/balance', ali)).body.find((x) => x.leaveType.code === 'casual');
  assert.equal(balance.remaining, casual.yearlyQuota - 1);

  // Employee was notified of the decision.
  assert.ok((await call('GET', '/notifications', ali)).body.items.some((n) => n.title === 'Leave approved'));

  // 4. HR dashboard works; payroll: HR drafts, HR cannot finalize, Admin finalizes, then it is locked.
  assert.equal((await call('GET', '/analytics/hr', hr)).status, 200);
  assert.equal((await call('GET', '/analytics/admin', hr)).status, 403);
  const now = new Date();
  const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const run = await call('POST', '/payroll/runs', hr, period);
  assert.equal(run.status, 201, JSON.stringify(run.body));
  assert.equal(run.body.totals.employees, 2);
  assert.equal((await call('POST', `/payroll/runs/${run.body._id}/finalize`, hr)).status, 403);
  assert.equal((await call('POST', `/payroll/runs/${run.body._id}/finalize`, admin)).status, 200);
  assert.equal((await call('POST', '/payroll/runs', hr, period)).status, 409);

  // 5. Employee downloads own payslip; cannot see a colleague's data or salary.
  const slips = (await call('GET', '/payroll/payslips', ali)).body;
  assert.equal(slips.length, 1);
  const pdf = await fetch(`${base}/payroll/payslips/${slips[0]._id}/pdf`, { headers: { authorization: `Bearer ${ali}` } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');

  const saraId = b.employee._id;
  assert.equal((await call('GET', `/employees/${saraId}`, ali)).status, 403);
  assert.equal((await call('GET', `/payroll/payslips?employee=${saraId}`, ali)).status, 403);
  assert.equal((await call('GET', `/attendance/calendar?employee=${saraId}`, ali)).status, 403);
  const list = (await call('GET', '/employees', ali)).body;
  assert.deepEqual(list.items.map((e) => e.code), ['E1']);
  assert.equal((await call('GET', '/audit-logs', ali)).status, 403);
  assert.equal((await call('GET', '/audit-logs', hr)).status, 403);

  // Admin sees the audit log, including the finalize, and entries are append-only.
  const audit = (await call('GET', '/audit-logs?action=finalize', admin)).body;
  assert.equal(audit.total, 1);
  const { AuditLog } = await import('../src/models/AuditLog.js');
  await assert.rejects(AuditLog.deleteMany({}));
});
