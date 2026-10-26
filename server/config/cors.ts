import { env } from './env.js';

export function isAllowedOrigin(origin?: string): boolean {
  const allowedOrigins = (env.ALLOWED_ORIGINS || env.CLIENT_URL).split(',').map((value) => value.trim()).filter(Boolean);
  return !origin || allowedOrigins.includes(origin);
}
