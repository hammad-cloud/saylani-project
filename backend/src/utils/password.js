import crypto from 'node:crypto';

// Temporary password handed to a new or reset user; they must change it on first sign-in.
export const generateTempPassword = () => crypto.randomBytes(6).toString('base64url');
