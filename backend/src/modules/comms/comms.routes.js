import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as service from './comms.service.js';

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(2000),
});

const router = Router();
router.use(authenticate);

/* Announcements: Admin & HR post, everyone reads */
router.get('/announcements', async (_req, res) => res.json(await service.listAnnouncements()));

router.post('/announcements', authorize('admin', 'hr'), validate(announcementSchema), async (req, res) => {
  res.status(201).json(await service.postAnnouncement(req.user, req.body));
});

/* Notifications: always the caller's own */
router.get('/notifications', async (req, res) => res.json(await service.listNotifications(req.user)));

router.post('/notifications/read-all', async (req, res) => {
  await service.markAllRead(req.user);
  res.json({ message: 'ok' });
});

/* Audit log: Admin read-only */
router.get('/audit-logs', authorize('admin'), async (req, res) => res.json(await service.listAuditLogs(req.query)));

export default router;
