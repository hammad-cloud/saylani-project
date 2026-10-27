import { Department } from '../../models/Department.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex, selfEmployeeId } from '../../utils/scope.js';
import * as analytics from '../analytics/analytics.service.js';
import { getBalances } from '../leave/leave.service.js';
import { listEmployees } from '../employees/employees.service.js';

const periodProps = {
  from: { type: 'string', description: 'Start date YYYY-MM-DD. Defaults to the 1st of the current month.' },
  to: { type: 'string', description: 'End date YYYY-MM-DD. Defaults to today.' },
  department: { type: 'string', description: 'Department name to filter by (optional).' },
};

// Each tool: who may call it, its JSON schema, and a run() that reuses the same services as the REST API.
// For Employees every tool is forced to their own employee id, whatever the model asks for.
const TOOLS = {
  get_headcount: {
    roles: ['admin', 'hr'],
    description: 'Active employee headcount, total and by department.',
    parameters: { department: periodProps.department },
    run: (f) => analytics.getHeadcount(f),
  },
  get_attendance_summary: {
    roles: ['admin', 'hr', 'employee'],
    description: 'Attendance counts (present, late, half day, absent, on leave), attendance rate, late % and absenteeism for a period. For an employee this is their own attendance.',
    parameters: periodProps,
    run: (f) => analytics.getAttendanceSummary(f),
  },
  get_late_comers: {
    roles: ['admin', 'hr'],
    description: 'Employees who came late most often in a period, highest first.',
    parameters: { ...periodProps, limit: { type: 'integer', description: 'How many to return (default 5).' } },
    run: (f, args) => analytics.getLateComers(f, Math.min(20, args.limit || 5)),
  },
  get_leave_summary: {
    roles: ['admin', 'hr', 'employee'],
    description: 'Approved leave days by type, pending requests and who is on leave today.',
    parameters: periodProps,
    run: (f) => analytics.getLeaveSummary(f),
  },
  get_my_leave_balance: {
    roles: ['admin', 'hr', 'employee'],
    description: "The current user's own leave balance for this year: quota, used, pending and remaining per leave type.",
    parameters: {},
    run: (_f, _args, user) => getBalances(selfEmployeeId(user)),
  },
  get_payroll_summary: {
    roles: ['admin', 'hr', 'employee'],
    description: 'Payroll cost (gross, net) by month, department and designation for a period. For an employee this is only their own pay.',
    parameters: periodProps,
    run: (f) => analytics.getPayrollSummary(f),
  },
  search_employees: {
    roles: ['admin', 'hr'],
    description: 'Search employees by name, email or code, optionally in a department and/or by status.',
    parameters: {
      query: { type: 'string', description: 'Name, email or employee code.' },
      department: periodProps.department,
      status: { type: 'string', enum: ['active', 'probation', 'exited'] },
    },
    run: async (f, args, user) => {
      const { items, total } = await listEmployees(user, { search: args.query, department: f.department, status: args.status, page: 1, limit: 25 });
      return {
        total,
        employees: items.map((e) => ({ code: e.code, name: e.name, email: e.email, department: e.department?.name, designation: e.designation?.name, status: e.status, joinDate: e.joinDate?.toISOString().slice(0, 10) })),
      };
    },
  },
};

export const toolDefinitions = (role) =>
  Object.entries(TOOLS)
    .filter(([, t]) => t.roles.includes(role))
    .map(([name, t]) => ({
      type: 'function',
      function: { name, description: t.description, parameters: { type: 'object', properties: t.parameters, required: [] } },
    }));

export async function runTool(user, name, args = {}) {
  const tool = TOOLS[name];
  if (!tool || !tool.roles.includes(user.role)) throw new ApiError(403, `Tool ${name} is not allowed for your role`);

  const isoDay = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : undefined);
  const filters = { from: isoDay(args.from), to: isoDay(args.to) };
  if (args.department) {
    const dept = await Department.findOne({ name: new RegExp(`^${escapeRegex(String(args.department).trim())}$`, 'i') });
    if (!dept) return { error: `No department named "${args.department}". Known departments: ${(await Department.find()).map((d) => d.name).join(', ') || 'none'}` };
    filters.department = dept._id;
  }
  if (user.role === 'employee') {
    filters.employee = selfEmployeeId(user);
    filters.department = null;
    filters.finalizedOnly = true;
  }
  return tool.run(filters, args, user);
}
