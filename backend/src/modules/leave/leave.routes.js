import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { scopedEmployeeId, selfEmployeeId } from '../../utils/scope.js';
import * as service from './leave.service.js';

const applySchema = z.object({
  leaveType: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a leave type'),
  start: z.string().date('Use YYYY-MM-DD'),
  end: z.string().date('Use YYYY-MM-DD'),
  reason: z.string().trim().max(300).optional(),
  viaAi: z.boolean().optional(),
});
const reviewSchema = z.object({ approve: z.boolean(), comment: z.string().trim().max(300).optional() });

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => res.json(await service.listLeaves(req.user, req.query)));

router.get('/balance', async (req, res) => {
  const id = scopedEmployeeId(req.user, req.query.employee) || selfEmployeeId(req.user);
  res.json(await service.getBalances(id, Number(req.query.year) || undefined));
});

router.post('/', authorize('hr', 'employee'), validate(applySchema), async (req, res) => {
  res.status(201).json(await service.applyLeave(req.user, req.body));
});

router.post('/:id/cancel', authorize('hr', 'employee'), async (req, res) => res.json(await service.cancelLeave(req.user, req.params.id)));

router.patch('/:id', authorize('hr'), validate(reviewSchema), async (req, res) => {
  res.json(await service.reviewLeave(req.user, req.params.id, req.body));
});

export default router;
