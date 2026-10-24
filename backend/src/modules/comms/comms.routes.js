import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { Announcement } from '../../models/Announcement.js';
import { Notification } from '../../models/Notification.js';
import { AuditLog } from '../../models/AuditLog.js';
import { audit } from '../../utils/audit.js';
import { notifyRoles } from '../../utils/notify.js';

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
});

const router = Router();
router.use(authenticate);

/* Announcements: Admin & HR post, everyone reads */
router.get('/announcements', async (_req, res) => {
  res.json(await Announcement.find().populate('author', 'name role').sort({ createdAt: -1 }).limit(50));
});

router.post('/announcements', authorize('admin', 'hr'), validate(announcementSchema), async (req, res) => {
  const a = await Announcement.create({ ...req.body, author: req.user._id });
  await audit(req.user._id, 'create', 'Announcement', { after: a });
  await notifyRoles(['admin', 'hr', 'employee'], `Announcement: ${a.title}`, a.body.slice(0, 140), '/');
  res.status(201).json(await a.populate('author', 'name role'));
});

/* Notifications: always the caller's own */
router.get('/notifications', async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.json({ items, unread });
});

router.post('/notifications/read-all', async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ message: 'ok' });
});

/* Audit log: Admin read-only */
router.get('/audit-logs', authorize('admin'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 30;
  const filter = {};
  if (typeof req.query.entity === 'string' && req.query.entity) filter.entity = req.query.entity;
  if (typeof req.query.action === 'string' && req.query.action) filter.action = req.query.action;
  const [items, total] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'name email role').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
});

export default router;
