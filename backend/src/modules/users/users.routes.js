import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as usersService from './users.service.js';

const createHrSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
});
const statusSchema = z.object({ isActive: z.boolean() });

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/', async (req, res) => {
  const { role, search } = req.query;
  res.json(await usersService.listUsers({ role: typeof role === 'string' ? role : undefined, search: typeof search === 'string' ? search : undefined }));
});

router.post('/hr', validate(createHrSchema), async (req, res) => {
  res.status(201).json(await usersService.createHrUser(req.user, req.body));
});

router.patch('/:id/status', validate(statusSchema), async (req, res) => {
  res.json(await usersService.setActive(req.user, req.params.id, req.body.isActive));
});

router.post('/:id/reset-password', async (req, res) => {
  res.json(await usersService.resetPassword(req.user, req.params.id));
});

export default router;
