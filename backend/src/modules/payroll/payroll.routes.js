import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as service from './payroll.service.js';

const runSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

const router = Router();
router.use(authenticate);

router.get('/runs', authorize('admin', 'hr'), async (_req, res) => res.json(await service.listRuns()));
router.post('/runs', authorize('hr'), validate(runSchema), async (req, res) => {
  res.status(201).json(await service.generateDraft(req.user, req.body.year, req.body.month));
});
router.get('/runs/:id', authorize('admin', 'hr'), async (req, res) => res.json(await service.getRun(req.params.id)));
router.post('/runs/:id/finalize', authorize('admin'), async (req, res) => res.json(await service.finalizeRun(req.user, req.params.id)));

router.get('/payslips', async (req, res) => res.json(await service.listPayslips(req.user, req.query)));
router.get('/payslips/:id', async (req, res) => res.json(await service.getPayslip(req.user, req.params.id)));
router.get('/payslips/:id/pdf', async (req, res) => service.streamPayslipPdf(req.user, req.params.id, res));

export default router;
