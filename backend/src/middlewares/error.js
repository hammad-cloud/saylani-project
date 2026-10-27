import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';

// Readable names for unique-index fields in "already exists" messages.
const FIELD_LABELS = { code: 'Employee code', email: 'Email', name: 'Name' };

export function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      message: 'Validation failed',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({ message: `${FIELD_LABELS[field] || 'This value'} already exists` });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(422).json({
      message: 'Validation failed',
      errors: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message, ...(err.details && { errors: err.details }) });
  }
  // Body-parser errors (bad JSON 400, body too large 413) are safe to show; anything else stays generic.
  if (err?.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: err.type === 'entity.parse.failed' ? 'Request body is not valid JSON' : err.message });
  }

  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
}
