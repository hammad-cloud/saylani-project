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
export async function runFirstSetup({ companyName, adminName, adminEmail, adminPassword }) {
  if (await isSetupComplete()) throw new ApiError(409, 'Setup has already been completed');

  await Setting.deleteMany({});
  const settings = await Setting.create({ companyName });
  const admin = await User.create({ name: adminName, email: adminEmail, password: adminPassword, role: 'admin' });

  for (const type of DEFAULT_LEAVE_TYPES) {
    await LeaveType.updateOne({ code: type.code }, { $setOnInsert: type }, { upsert: true });
  }

  await audit(admin._id, 'create', 'Setup', { after: settings });
  return admin;
}

export async function bootstrapFromEnv() {
  if (!env.adminEmail || !env.adminPassword || (await isSetupComplete())) return;
  await runFirstSetup({
    companyName: env.companyName || 'My Company',
    adminName: 'Admin',
    adminEmail: env.adminEmail,
    adminPassword: env.adminPassword,
  });
  console.log(`First Admin created from env: ${env.adminEmail}`);
}
