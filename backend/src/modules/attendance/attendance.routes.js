import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as service from './attendance.service.js';

const checkInSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('web') }),
  z.object({
    source: z.literal('camera'),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0),
    faceCount: z.number().int().min(0),
    liveness: z.boolean().optional(),
    descriptor: z.array(z.number()).length(128).optional(),
  }),
]);

const correctionSchema = z.object({
  date: z.string().date('Use YYYY-MM-DD'),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  reason: z.string().trim().min(5, 'Please give a reason').max(300),
});

const reviewSchema = z.object({ approve: z.boolean(), comment: z.string().trim().max(300).optional() });
const enrollSchema = z.object({ descriptor: z.array(z.number()).length(128) });

const monthQuery = (q) => {
  const now = new Date();
  const year = Number(q.year) || now.getUTCFullYear();
  const month = Math.min(12, Math.max(1, Number(q.month) || now.getUTCMonth() + 1));
  return { year, month };
};

const router = Router();
router.use(authenticate);

router.get('/today', authorize('hr', 'employee'), async (req, res) => res.json(await service.getToday(req.user)));
router.post('/check-in', authorize('hr', 'employee'), validate(checkInSchema), async (req, res) => {
  res.status(201).json(await service.checkIn(req.user, req.body));
});
router.post('/check-out', authorize('hr', 'employee'), async (req, res) => res.json(await service.checkOut(req.user)));
router.post('/face/enroll', authorize('hr', 'employee'), validate(enrollSchema), async (req, res) => {
  await service.enrollFace(req.user, req.body.descriptor);
  res.json({ message: 'Face enrolled' });
});

router.get('/calendar', async (req, res) => {
  const { year, month } = monthQuery(req.query);
  res.json(await service.getCalendar(req.user, req.query.employee, year, month));
});

router.get('/board', authorize('admin', 'hr'), async (req, res) => {
  res.json(await service.dailyBoard(req.query.date, req.query.department));
});

router.get('/corrections', async (req, res) => res.json(await service.listCorrections(req.user, req.query)));
router.post('/corrections', authorize('employee', 'hr'), validate(correctionSchema), async (req, res) => {
  res.status(201).json(await service.requestCorrection(req.user, req.body));
});
router.patch('/corrections/:id', authorize('hr'), validate(reviewSchema), async (req, res) => {
  res.json(await service.reviewCorrection(req.user, req.params.id, req.body));
});

export default router;
