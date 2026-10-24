import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { Setting } from '../../models/Setting.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';

const settingsSchema = z
  .object({
    companyName: z.string().trim().min(2),
    officeStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
    graceMinutes: z.number().int().min(0).max(240),
    halfDayHours: z.number().min(0).max(24),
    weekend: z.array(z.number().int().min(0).max(6)).max(6),
    officeLocation: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    radiusMeters: z.number().int().min(10).max(10000),
  })
  .partial();

const router = Router();
router.use(authenticate);

router.get('/', authorize('admin', 'hr'), async (_req, res) => {
  const settings = await Setting.findOne();
  if (!settings) throw new ApiError(404, 'Company setup not completed');
  res.json(settings);
});

router.put('/', authorize('admin'), validate(settingsSchema), async (req, res) => {
  const before = await Setting.findOne();
  if (!before) throw new ApiError(404, 'Company setup not completed');
  const after = await Setting.findByIdAndUpdate(before._id, req.body, { returnDocument: 'after', runValidators: true });
  await audit(req.user._id, 'update', 'Setting', { before, after });
  res.json(after);
});

export default router;
