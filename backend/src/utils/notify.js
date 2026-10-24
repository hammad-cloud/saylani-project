import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';

export const notifyUser = (userId, title, body, link) => userId && Notification.create({ user: userId, title, body, link });

export async function notifyRoles(roles, title, body, link) {
  const users = await User.find({ role: { $in: roles }, isActive: true }, '_id');
  if (users.length) await Notification.insertMany(users.map((u) => ({ user: u._id, title, body, link })));
}
