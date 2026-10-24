import { User } from '../../models/User.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { generateTempPassword } from '../../utils/password.js';
import { escapeRegex } from '../../utils/scope.js';

export function listUsers({ role, search } = {}) {
  const filter = {};
  if (role) filter.role = role;
  if (search) filter.$or = [{ name: new RegExp(escapeRegex(search), 'i') }, { email: new RegExp(escapeRegex(search), 'i') }];
  return User.find(filter).sort({ createdAt: -1 });
}

export async function createHrUser(actor, { name, email }) {
  const tempPassword = generateTempPassword();
  const user = await User.create({ name, email, password: tempPassword, role: 'hr', mustChangePassword: true });
  await audit(actor._id, 'create', 'User', { after: user });
  return { user, tempPassword };
}

export async function setActive(actor, id, isActive) {
  if (actor.id === id) throw new ApiError(400, 'You cannot change your own account status');
  const before = await User.findById(id);
  if (!before) throw new ApiError(404, 'User not found');
  const after = await User.findByIdAndUpdate(id, { isActive }, { returnDocument: 'after' });
  await audit(actor._id, isActive ? 'activate' : 'deactivate', 'User', { before, after });
  return after;
}

export async function resetPassword(actor, id) {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  const tempPassword = generateTempPassword();
  user.password = tempPassword;
  user.mustChangePassword = true;
  await user.save();
  await audit(actor._id, 'reset_password', 'User', { id: user._id });
  return { user, tempPassword };
}
