import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.js';
import { isSetupComplete, runFirstSetup } from './setup.service.js';

const setupSchema = z.object({
  companyName: z.string().trim().min(2),
  adminName: z.string().trim().min(2),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const router = Router();

router.get('/status', async (_req, res) => {
  res.json({ setupComplete: await isSetupComplete() });
});

router.post('/', validate(setupSchema), async (req, res) => {
  const admin = await runFirstSetup(req.body);
  res.status(201).json({ message: 'Setup complete', admin });
});

export default router;
