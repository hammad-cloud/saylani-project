import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validate } from '../../middlewares/validate.js';
import { authenticateAllowTempPassword } from '../../middlewares/auth.js';
import * as authService from './auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { message: 'Too many login attempts, try again later' } });

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  res.json(await authService.login(req.body.email, req.body.password));
});

router.get('/me', authenticateAllowTempPassword, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', authenticateAllowTempPassword, validate(changePasswordSchema), async (req, res) => {
  const user = await authService.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
  res.json({ message: 'Password changed', user });
});

export default router;
