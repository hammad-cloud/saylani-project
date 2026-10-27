// Shared harness for the API tests: the real Express app on a random port against a throwaway database.
// Needs MongoDB (docker compose up -d); start() returns false when it is not reachable so tests can skip.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

let base;
let server;

// Each test file runs in its own process, so each gets its own database (files run in parallel).
export async function start(dbSuffix = '') {
  process.env.MONGO_URI = (process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/hcm-lite-test') + dbSuffix;
  process.env.JWT_SECRET ||= 'test-secret';
  process.env.NODE_ENV = 'test';
  process.env.AI_API_KEY = ''; // tests never call the real LLM provider
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 2000 });
  } catch {
    return false;
  }
  await mongoose.connection.dropDatabase();
  await import('../src/models/index.js');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const { app } = await import('../src/app.js');
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  return true;
}

export async function stop() {
  server?.close();
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

export async function call(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
}

export const rawFetch = (path, init) => fetch(base + path, init);

export async function login(email, password) {
  const r = await call('POST', '/auth/login', null, { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

// First-login flow: temporary password must be changed before anything else works.
export async function firstLogin(email, tempPassword, newPassword) {
  const t = await login(email, tempPassword);
  assert.equal((await call('GET', '/employees/me', t)).status, 403);
  assert.equal((await call('POST', '/auth/change-password', t, { currentPassword: tempPassword, newPassword })).status, 200);
  return login(email, newPassword);
}

// Next working day (Mon-Fri) strictly after today, as YYYY-MM-DD.
export function nextWorkingDay(offset = 1) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
