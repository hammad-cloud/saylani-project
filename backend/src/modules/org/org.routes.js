import { Router } from 'express';
import { z } from 'zod';
import { crudRouter } from './crud.js';
import { Department } from '../../models/Department.js';
import { Designation } from '../../models/Designation.js';
import { LeaveType } from '../../models/LeaveType.js';
import { Holiday } from '../../models/Holiday.js';

const named = z.object({ name: z.string().trim().min(2).max(80) });

const leaveTypeSchema = z.object({
  name: z.string().trim().min(2).max(40),
  code: z.string().trim().toLowerCase().regex(/^[a-z_]+$/, 'Lowercase letters and _ only'),
  yearlyQuota: z.number().int().min(0).max(365).nullable(),
  paid: z.boolean(),
});

const holidaySchema = z.object({
  name: z.string().trim().min(2).max(80),
  date: z.string().date('Use YYYY-MM-DD'),
});

const router = Router();
router.use('/departments', crudRouter(Department, named));
router.use('/designations', crudRouter(Designation, named));
router.use('/leave-types', crudRouter(LeaveType, leaveTypeSchema));
router.use('/holidays', crudRouter(Holiday, holidaySchema, { sort: { date: 1 } }));

export default router;
