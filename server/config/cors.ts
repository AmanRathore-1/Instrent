import { env } from './env.js';

export function isAllowedOrigin(origin?: string): boolean {
  return !origin || origin === env.CLIENT_URL;
}
