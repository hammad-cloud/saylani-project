import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as ai from './ai.service.js';

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30)
    .refine((m) => m.at(-1).role === 'user', 'Last message must be from the user'),
});
const summarySchema = z.object({ kpis: z.record(z.string(), z.any()) });
const smartLeaveSchema = z.object({ text: z.string().trim().min(3).max(500) });

const router = Router();
router.use(authenticate);

router.post('/chat', validate(chatSchema), async (req, res) => res.json(await ai.chat(req.user, req.body.messages)));
router.post('/summary', authorize('admin', 'hr'), validate(summarySchema), async (req, res) => res.json(await ai.summarize(req.user, req.body.kpis)));
router.post('/smart-leave', authorize('hr', 'employee'), validate(smartLeaveSchema), async (req, res) => res.json(await ai.smartLeave(req.user, req.body.text)));

export default router;
