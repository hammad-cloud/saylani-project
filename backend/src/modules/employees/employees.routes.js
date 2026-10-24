import { Router } from 'express';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { EMPLOYEE_STATUSES } from '../../models/Employee.js';
import * as service from './employees.service.js';
import { getEmployee360 } from './employee360.service.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const employeeSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(20),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(200).optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  department: objectId,
  designation: objectId.optional(),
  joinDate: z.string().date('Use YYYY-MM-DD'),
  exitDate: z.string().date('Use YYYY-MM-DD').optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  basicSalary: z.number().positive('Salary must be greater than 0'),
});

const contactSchema = z.object({
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(200).optional(),
});

const importSchema = z.object({ csv: z.string().min(1).max(2_000_000), dryRun: z.boolean().default(true) });

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const { search, department, status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json(await service.listEmployees(req.user, { search, department, status, page, limit }));
});

router.get('/export', authorize('hr'), async (_req, res) => {
  res.type('text/csv').attachment('employees.csv').send(await service.exportEmployeesCsv());
});

router.post('/import', authorize('hr'), validate(importSchema), async (req, res) => {
  let rows;
  try {
    rows = parse(req.body.csv, { columns: (h) => h.map((c) => c.trim()), skip_empty_lines: true, trim: true, bom: true });
  } catch (err) {
    throw new ApiError(422, `Could not read CSV: ${err.message}`);
  }
  if (!rows.length) throw new ApiError(422, 'CSV has no data rows');
  res.json(await service.importEmployees(req.user, rows, { dryRun: req.body.dryRun }));
});

router.get('/me', async (req, res) => {
  res.json(await getEmployee360(req.user, req.user.employee));
});

router.patch('/me', authorize('employee'), validate(contactSchema), async (req, res) => {
  res.json(await service.updateOwnContact(req.user, req.body));
});

router.get('/:id', async (req, res) => {
  res.json(await getEmployee360(req.user, req.params.id));
});

router.post('/', authorize('hr'), validate(employeeSchema), async (req, res) => {
  res.status(201).json(await service.createEmployee(req.user, req.body));
});

router.put('/:id', authorize('hr'), validate(employeeSchema.partial()), async (req, res) => {
  res.json(await service.updateEmployee(req.user, req.params.id, req.body));
});

export default router;
