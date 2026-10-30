import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PRESENCE_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(120),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  APP_URL: z.string().url().optional(),
  CLIENT_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().min(32),
  OTP_HMAC_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(2_592_000).default(2_592_000),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  URBACKEND_SECRET_KEY: z.string().min(1),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const invalidVariables = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
  throw new Error(
    `Invalid server environment. Add or correct these variables in the root .env file: ${invalidVariables.join(', ')}`,
  );
}

export const env = parsed.data;
