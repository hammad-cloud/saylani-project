// Role and data-scope checks from the brief's access table (Section 2 / checklist), plus Phase 1 regressions.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { start, stop, call, login, firstLogin } from './helpers.js';

let mongoOk;
const w = {}; // tokens and ids shared by the tests below
const FAKE_ID = '0123456789abcdef01234567';
const now = new Date();
const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };

before(async () => {
  mongoOk = await start('-rbac');
  if (!mongoOk) return;

  await call('POST', '/setup', null, { companyName: 'RBAC Co', adminName: 'Ada Admin', adminEmail: 'admin@rbac.co', adminPassword: 'admin1234' });
  w.admin = await login('admin@rbac.co', 'admin1234');
  w.dept = (await call('POST', '/departments', w.admin, { name: 'Engineering' })).body;

  const hrRes = await call('POST', '/users/hr', w.admin, { name: 'Hina HR', email: 'hr@rbac.co' });
  w.hr = await firstLogin('hr@rbac.co', hrRes.body.tempPassword, 'hrpass123');
  const hr2Res = await call('POST', '/users/hr', w.admin, { name: 'Omar HR', email: 'hr2@rbac.co' });
  w.hr2 = await firstLogin('hr2@rbac.co', hr2Res.body.tempPassword, 'hrpass456');

  const register = (token, code, name, email) =>
    call('POST', '/employees', token, { code, name, email, department: w.dept._id, joinDate: '2026-01-01', basicSalary: 100000 });
  // Hina's HR login is also registered as an employee (by the other HR officer), so she can check in and be paid.
  w.hrEmp = (await register(w.hr2, 'H1', 'Hina HR', 'hr@rbac.co')).body.employee;
  w.hr = await login('hr@rbac.co', 'hrpass123'); // fresh token now linked to the employee profile
  const ali = (await register(w.hr, 'E1', 'Ali Ahmed', 'ali@rbac.co')).body;
  const sara = (await register(w.hr, 'E2', 'Sara Khan', 'sara@rbac.co')).body;
  w.aliId = ali.employee._id;
  w.saraId = sara.employee._id;
  w.emp = await firstLogin('ali@rbac.co', ali.tempPassword, 'alipass123');
  w.sara = await firstLogin('sara@rbac.co', sara.tempPassword, 'sarapass123');
});

after(stop);

// [method, path, body, { admin, hr, employee }]: 'ok' = allowed (anything but 401/403), or an exact status.
const MATRIX = [
  ['GET', '/settings', null, { admin: 'ok', hr: 'ok', employee: 403 }],
  ['PUT', '/settings', { graceMinutes: 15 }, { admin: 'ok', hr: 403, employee: 403 }],
  ['GET', '/departments', null, { admin: 'ok', hr: 'ok', employee: 403 }],
  ['POST', '/designations', { name: 'Engineer' }, { admin: 'ok', hr: 403, employee: 403 }],
  ['GET', '/users', null, { admin: 'ok', hr: 403, employee: 403 }],
  ['POST', '/users/hr', { name: 'New HR', email: 'new@rbac.co' }, { admin: 'ok', hr: 403, employee: 403 }],
  ['POST', '/employees', { code: 'X1' }, { admin: 403, hr: 'ok', employee: 403 }],
  ['GET', '/employees/export', null, { admin: 403, hr: 'ok', employee: 403 }],
  ['GET', '/attendance/board', null, { admin: 'ok', hr: 'ok', employee: 403 }],
  ['POST', '/attendance/check-in', { source: 'web' }, { admin: 403, hr: 'ok', employee: 'ok' }],
  ['PATCH', `/attendance/corrections/${FAKE_ID}`, { approve: true }, { admin: 404, hr: 404, employee: 403 }], // Admin: HR staff requests only
  ['PATCH', `/leaves/${FAKE_ID}`, { approve: true }, { admin: 404, hr: 404, employee: 403 }],
  ['GET', '/payroll/runs', null, { admin: 'ok', hr: 'ok', employee: 403 }],
  ['POST', '/payroll/runs', { year: 2020, month: 1 }, { admin: 403, hr: 422, employee: 403 }],
  ['POST', `/payroll/runs/${FAKE_ID}/finalize`, null, { admin: 404, hr: 403, employee: 403 }],
  ['GET', '/analytics/admin', null, { admin: 'ok', hr: 403, employee: 403 }],
  ['GET', '/analytics/hr', null, { admin: 'ok', hr: 'ok', employee: 403 }],
  ['GET', '/analytics/me', null, { admin: 403, hr: 'ok', employee: 'ok' }],
  ['GET', '/audit-logs', null, { admin: 'ok', hr: 403, employee: 403 }],
  ['POST', '/announcements', { title: 'Hello all', body: 'Welcome aboard' }, { admin: 'ok', hr: 'ok', employee: 403 }],
  ['POST', '/ai/summary', { kpis: { headcount: 3 } }, { admin: 'ok', hr: 'ok', employee: 403 }],
  ['POST', '/ai/smart-leave', { text: 'need leave tomorrow' }, { admin: 403, hr: 'ok', employee: 'ok' }],
];

test('role matrix: every endpoint allows exactly the roles in the brief', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const tokens = { admin: w.admin, hr: w.hr, employee: w.emp };
  for (const [method, path, body, expected] of MATRIX) {
    for (const [role, want] of Object.entries(expected)) {
      const { status } = await call(method, path, tokens[role], body);
      const label = `${role} ${method} ${path} -> ${status}`;
      if (want === 'ok') assert.ok(![401, 403].includes(status), label);
      else assert.equal(status, want, label);
    }
  }
  assert.equal((await call('GET', '/employees')).status, 401); // no token at all
});

test('data scope: an employee only ever reads their own rows', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  for (const path of [
    `/employees/${w.saraId}`,
    `/leaves?employee=${w.saraId}`,
    `/leaves/balance?employee=${w.saraId}`,
    `/payroll/payslips?employee=${w.saraId}`,
    `/attendance/calendar?employee=${w.saraId}`,
  ]) {
    assert.equal((await call('GET', path, w.emp)).status, 403, path);
  }
  assert.deepEqual((await call('GET', '/employees', w.emp)).body.items.map((e) => e.code), ['E1']);
});

test('regression: HR cannot edit their own employee record (salary, status), only their contact details', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const own = await call('PUT', `/employees/${w.hrEmp._id}`, w.hr, { basicSalary: 999999 });
  assert.equal(own.status, 403);
  assert.equal((await call('GET', `/employees/${w.hrEmp._id}`, w.hr2)).body.employee.basicSalary, 100000);

  assert.equal((await call('PUT', `/employees/${w.aliId}`, w.hr, { phone: '0300-1234567' })).status, 200); // others: fine
  const contact = await call('PATCH', '/employees/me', w.hr, { phone: '0311-7654321', address: 'Karachi' });
  assert.equal(contact.status, 200);
  assert.equal(contact.body.phone, '0311-7654321');
  assert.equal((await call('PATCH', '/employees/me', w.admin, { phone: '1' })).status, 403);
});

test('regression: dashboard filters are validated (400-class errors, never 500) and the period is capped', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  for (const q of [
    'department=not-an-id',
    'department=a&department=b',
    'from=2026-02-30',
    'from=yesterday',
    'from=2026-03-10&to=2026-03-01',
    'from=2020-01-01&to=2026-01-01',
  ]) {
    const r = await call('GET', `/analytics/hr?${q}`, w.hr);
    assert.equal(r.status, 422, `${q} -> ${r.status} ${JSON.stringify(r.body)}`);
  }
  assert.equal((await call('GET', `/analytics/hr?department=${w.dept._id}&from=2026-01-01&to=2026-12-31`, w.hr)).status, 200);
  assert.equal((await call('GET', '/analytics/admin?from=2025-06-01', w.admin)).status, 422); // more than a year to today
});

test('regression: the AI payroll tool never shows an employee their draft (unfinalized) pay', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const { runTool } = await import('../src/modules/ai/ai.tools.js');
  const { User } = await import('../src/models/User.js');
  const aliUser = await User.findOne({ email: 'ali@rbac.co' });
  const hrUser = await User.findOne({ email: 'hr@rbac.co' });

  const run = await call('POST', '/payroll/runs', w.hr, period);
  assert.equal(run.status, 201, JSON.stringify(run.body));

  const draft = await runTool(aliUser, 'get_payroll_summary', {});
  assert.equal(draft.totalGross, 0);
  assert.deepEqual(draft.byMonth, []);
  assert.ok((await runTool(hrUser, 'get_payroll_summary', {})).totalGross > 0); // HR sees the draft

  assert.equal((await call('POST', `/payroll/runs/${run.body._id}/finalize`, w.admin)).status, 200);
  const final = await runTool(aliUser, 'get_payroll_summary', {});
  assert.equal(final.byMonth.length, 1);
  assert.equal(final.byMonth[0].employees, 1); // only Ali's own slip

  // Admin/HR-only tools are refused for an employee, whatever the model asks for.
  await assert.rejects(runTool(aliUser, 'search_employees', { query: 'Sara' }), /not allowed/);
});

test('security: forged, foreign or deactivated tokens and injection payloads are rejected', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const { sub } = jwt.decode(w.emp);
  const forged = [
    jwt.sign({ sub, role: 'admin' }, 'wrong-secret'),
    `${jwt.sign({ sub, role: 'employee' }, 'x').split('.').slice(0, 2).join('.')}.`, // stripped signature
    `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub, role: 'admin' })).toString('base64url')}.`,
  ];
  for (const token of forged) assert.equal((await call('GET', '/audit-logs', token)).status, 401);

  // NoSQL operator injection in login is a validation error, not a login.
  assert.equal((await call('POST', '/auth/login', null, { email: { $ne: null }, password: { $ne: null } })).status, 422);

  // Password hashes never leave the server.
  assert.ok(!JSON.stringify((await call('GET', '/users', w.admin)).body).includes('password'));

  // Deactivating a login cuts off its existing token at once.
  const saraUser = (await call('GET', '/users?search=sara', w.admin)).body[0];
  assert.equal((await call('PATCH', `/users/${saraUser._id}/status`, w.admin, { isActive: false })).status, 200);
  assert.equal((await call('GET', '/employees/me', w.sara)).status, 401);
});
