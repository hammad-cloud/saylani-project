import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { selfEmployeeId } from '../../utils/scope.js';
import * as service from './analytics.service.js';

const filters = (q) => ({ from: q.from, to: q.to, department: q.department });

const router = Router();
router.use(authenticate);

router.get('/admin', authorize('admin'), async (req, res) => res.json(await service.adminDashboard(filters(req.query))));
router.get('/hr', authorize('admin', 'hr'), async (req, res) => res.json(await service.hrDashboard(filters(req.query))));
router.get('/me', async (req, res) => {
  selfEmployeeId(req.user);
  res.json(await service.employeeDashboard(req.user));
});

router.get('/attendance', authorize('admin', 'hr'), async (req, res) => res.json(await service.getAttendanceSummary(filters(req.query))));
router.get('/leave', authorize('admin', 'hr'), async (req, res) => res.json(await service.getLeaveSummary(filters(req.query))));
router.get('/payroll', authorize('admin', 'hr'), async (req, res) => res.json(await service.getPayrollSummary(filters(req.query))));
router.get('/insights', authorize('admin', 'hr'), async (req, res) => res.json(await service.getInsights(filters(req.query))));

export default router;
