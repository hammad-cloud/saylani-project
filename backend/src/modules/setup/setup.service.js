import { User } from '../../models/User.js';
import { Setting } from '../../models/Setting.js';
import { LeaveType, DEFAULT_LEAVE_TYPES } from '../../models/LeaveType.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { env } from '../../config/env.js';

export async function isSetupComplete() {
  return Boolean(await User.exists({ role: 'admin' }));
}

// Creates the company settings, the first Admin and the default leave types (rule config, not dummy data).
// The Admin is created first: the one-Admin unique index lets only one of two concurrent setups through.
export async function runFirstSetup({ companyName, adminName, adminEmail, adminPassword }) {
  if (await isSetupComplete()) throw new ApiError(409, 'Setup has already been completed');

  let admin;
  try {
    admin = await User.create({ name: adminName, email: adminEmail, password: adminPassword, role: 'admin' });
  } catch (err) {
    if (err?.code === 11000) throw new ApiError(409, 'Setup has already been completed');
    throw err;
  }

  let settings;
  try {
    await Setting.deleteMany({});
    settings = await Setting.create({ companyName });
  } catch (err) {
    await User.deleteOne({ _id: admin._id }); // leave the install fresh so setup can be retried
    throw err;
  }

  for (const type of DEFAULT_LEAVE_TYPES) {
    await LeaveType.updateOne({ code: type.code }, { $setOnInsert: type }, { upsert: true });
  }

  await audit(admin._id, 'create', 'Setup', { after: settings });
  return admin;
}

export async function bootstrapFromEnv() {
  if (!env.adminEmail || !env.adminPassword || (await isSetupComplete())) return;
  try {
    await runFirstSetup({
      companyName: env.companyName || 'My Company',
      adminName: 'Admin',
      adminEmail: env.adminEmail,
      adminPassword: env.adminPassword,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return; // another serverless instance won the race
    throw err;
  }
  console.log(`First Admin created from env: ${env.adminEmail}`);
}
