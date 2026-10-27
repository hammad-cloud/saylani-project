// Session revocation (password change, reset, logout) and the one-time, race-safe first-run setup.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { start, stop, call, login, firstLogin } from './helpers.js';

let mongoOk;

before(async () => {
  mongoOk = await start('-auth');
});

after(stop);

test('first-run setup: concurrent requests create exactly one Admin and one settings document', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const attempts = Array.from({ length: 6 }, (_, i) =>
    call('POST', '/setup', null, { companyName: `Race Co ${i}`, adminName: 'Ada Admin', adminEmail: `admin${i}@auth.co`, adminPassword: 'admin1234' })
  );
  const results = await Promise.all(attempts);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409], JSON.stringify(results.map((r) => r.body)));

  const winner = results.findIndex((r) => r.status === 201);
  const { User } = await import('../src/models/User.js');
  const { Setting } = await import('../src/models/Setting.js');
  assert.equal(await User.countDocuments({ role: 'admin' }), 1);
  const settings = await Setting.find();
  assert.equal(settings.length, 1);
  assert.equal(settings[0].companyName, `Race Co ${winner}`); // the winner's company, not a loser's
  assert.equal((await call('GET', '/setup/status')).body.setupComplete, true);
});

test('sessions issued before this change (no version in the token) keep working', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const { User } = await import('../src/models/User.js');
  const admin = await User.findOne({ role: 'admin' });
  const legacy = jwt.sign({ sub: admin.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const me = await call('GET', '/auth/me', legacy);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.tokenVersion, undefined); // never sent to the browser
});

test('changing a password signs out every other session but keeps the current one', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const { User } = await import('../src/models/User.js');
  const email = (await User.findOne({ role: 'admin' })).email;
  const laptop = await login(email, 'admin1234');
  const phone = await login(email, 'admin1234');

  const changed = await call('POST', '/auth/change-password', laptop, { currentPassword: 'admin1234', newPassword: 'admin5678' });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.token);

  assert.equal((await call('GET', '/auth/me', laptop)).status, 401);
  assert.equal((await call('GET', '/auth/me', phone)).status, 401);
  assert.equal((await call('GET', '/users', changed.body.token)).status, 200);
  assert.equal((await call('POST', '/auth/login', null, { email, password: 'admin1234' })).status, 401);
});

test('an Admin password reset signs the user out everywhere and forces a new password', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const { User } = await import('../src/models/User.js');
  const admin = await login((await User.findOne({ role: 'admin' })).email, 'admin5678');

  const created = await call('POST', '/users/hr', admin, { name: 'Hina HR', email: 'hr@auth.co' });
  const hr = await firstLogin('hr@auth.co', created.body.tempPassword, 'hrpass123');
  assert.equal((await call('GET', '/departments', hr)).status, 200);

  const reset = await call('POST', `/users/${created.body.user._id}/reset-password`, admin);
  assert.equal(reset.status, 200);
  assert.equal((await call('GET', '/departments', hr)).status, 401); // old session is gone
  await firstLogin('hr@auth.co', reset.body.tempPassword, 'hrpass456'); // temp password must be changed first
});

test('logout revokes the token on the server, not just in the browser', async (t) => {
  if (!mongoOk) return t.skip('MongoDB not reachable');
  const token = await login('hr@auth.co', 'hrpass456');
  assert.equal((await call('GET', '/auth/me', token)).status, 200);
  assert.equal((await call('POST', '/auth/logout', token)).status, 200);
  assert.equal((await call('GET', '/auth/me', token)).status, 401);
  assert.equal((await call('POST', '/auth/logout', token)).status, 401); // a revoked token cannot be reused
  assert.equal((await call('GET', '/auth/me', await login('hr@auth.co', 'hrpass456'))).status, 200);
});
