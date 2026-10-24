import { Announcement } from '../../models/Announcement.js';
import { Notification } from '../../models/Notification.js';
import { AuditLog } from '../../models/AuditLog.js';
import { audit } from '../../utils/audit.js';
import { notifyRoles } from '../../utils/notify.js';

const AUDIT_PAGE_SIZE = 30;

export function listAnnouncements() {
  return Announcement.find().populate('author', 'name role').sort({ createdAt: -1 }).limit(50);
}

// Admin & HR post; every role gets a notification.
export async function postAnnouncement(user, data) {
  const a = await Announcement.create({ ...data, author: user._id });
  await audit(user._id, 'create', 'Announcement', { after: a });
  await notifyRoles(['admin', 'hr', 'employee'], `Announcement: ${a.title}`, a.body.slice(0, 140), '/');
  return a.populate('author', 'name role');
}

// Always the caller's own notifications.
export async function listNotifications(user) {
  const [items, unread] = await Promise.all([
    Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ user: user._id, read: false }),
  ]);
  return { items, unread };
}

export function markAllRead(user) {
  return Notification.updateMany({ user: user._id, read: false }, { read: true });
}

export async function listAuditLogs(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const filter = {};
  if (typeof query.entity === 'string' && query.entity) filter.entity = query.entity;
  if (typeof query.action === 'string' && query.action) filter.action = query.action;
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * AUDIT_PAGE_SIZE)
      .limit(AUDIT_PAGE_SIZE),
    AuditLog.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.ceil(total / AUDIT_PAGE_SIZE) || 1 };
}
