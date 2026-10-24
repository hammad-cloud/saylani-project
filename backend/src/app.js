import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middlewares/error.js';
import setupRoutes from './modules/setup/setup.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import orgRoutes from './modules/org/org.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import employeesRoutes from './modules/employees/employees.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import payrollRoutes from './modules/payroll/payroll.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import commsRoutes from './modules/comms/comms.routes.js';

export const app = express();

// Behind Vercel / Render proxies: use the real client IP for rate limits.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.clientUrl.split(','), credentials: true }));
app.use(express.json({ limit: '3mb' })); // CSV import accepts up to 2 MB of text
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', orgRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', commsRoutes);

app.use(notFound);
app.use(errorHandler);
