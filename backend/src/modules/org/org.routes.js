import { Router } from 'express';
import { z } from 'zod';
import { crudRouter } from './crud.js';
import { Department } from '../../models/Department.js';
import { Designation } from '../../models/Designation.js';
import { LeaveType } from '../../models/LeaveType.js';
import { Holiday } from '../../models/Holiday.js';
import { Employee } from '../../models/Employee.js';
import { Leave } from '../../models/Leave.js';

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

// Deleting something still referenced would orphan employees and break leave history, payroll and reports.
const usedBy = (Model, field, what) => async (id) => {
  const n = await Model.countDocuments({ [field]: id });
  return n ? `it is used by ${n} ${what}${n === 1 ? '' : 's'}` : null;
};

const router = Router();
router.use('/departments', crudRouter(Department, named, { inUse: usedBy(Employee, 'department', 'employee') }));
router.use('/designations', crudRouter(Designation, named, { inUse: usedBy(Employee, 'designation', 'employee') }));
router.use('/leave-types', crudRouter(LeaveType, leaveTypeSchema, { inUse: usedBy(Leave, 'leaveType', 'leave request') }));
router.use('/holidays', crudRouter(Holiday, holidaySchema, { sort: { date: 1 } }));

export default router;
