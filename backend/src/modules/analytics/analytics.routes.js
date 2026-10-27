import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { selfEmployeeId } from '../../utils/scope.js';
import * as service from './analytics.service.js';

const filters = (q) => ({ from: q.from, to: q.to, department: q.department });

// Identical dashboard requests that arrive while one is being computed share its result. Nothing is kept
// afterwards (not a cache), so numbers are never stale; it just stops a burst of refreshes recomputing the same thing.
const inFlight = new Map();
function shared(key, compute) {
  if (!inFlight.has(key)) inFlight.set(key, compute().finally(() => inFlight.delete(key)));
  return inFlight.get(key);
}

const router = Router();
router.use(authenticate);

// Admin and HR dashboards depend only on the filters, not on who asks, so they can be shared.
router.get('/admin', authorize('admin'), async (req, res) => {
  const f = filters(req.query);
  res.json(await shared(`admin|${JSON.stringify(f)}`, () => service.adminDashboard(f)));
});
router.get('/hr', authorize('admin', 'hr'), async (req, res) => {
  const f = filters(req.query);
  res.json(await shared(`hr|${JSON.stringify(f)}`, () => service.hrDashboard(f)));
});
router.get('/me', async (req, res) => {
  selfEmployeeId(req.user);
  res.json(await service.employeeDashboard(req.user));
});

router.get('/attendance', authorize('admin', 'hr'), async (req, res) => res.json(await service.getAttendanceSummary(filters(req.query))));
router.get('/leave', authorize('admin', 'hr'), async (req, res) => res.json(await service.getLeaveSummary(filters(req.query))));
router.get('/payroll', authorize('admin', 'hr'), async (req, res) => res.json(await service.getPayrollSummary(filters(req.query))));
router.get('/insights', authorize('admin', 'hr'), async (req, res) => res.json(await service.getInsights(filters(req.query))));

export default router;
