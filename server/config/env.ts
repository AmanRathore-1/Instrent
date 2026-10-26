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
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  OTP_HMAC_SECRET: z.string().min(32).optional(),
  AUTH_OTP_SECRET: z.string().min(32).optional(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(2_592_000).default(2_592_000),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.preprocess(
    (value) => typeof value === 'string' ? value.toLowerCase() === 'true' : value,
    z.boolean().default(false),
  ),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().min(3).optional(),
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

if (parsed.data.NODE_ENV === 'production' && !parsed.data.JWT_ACCESS_SECRET && !parsed.data.JWT_SECRET) {
  throw new Error('Invalid server environment. Add JWT_ACCESS_SECRET to the root .env file.');
}
if (parsed.data.NODE_ENV === 'production' && !parsed.data.OTP_HMAC_SECRET && !parsed.data.AUTH_OTP_SECRET) {
  throw new Error('Invalid server environment. Add OTP_HMAC_SECRET to the root .env file.');
}
if (parsed.data.NODE_ENV === 'production') {
  const missingSmtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL']
    .filter((key) => !parsed.data[key as 'SMTP_HOST' | 'SMTP_USER' | 'SMTP_PASS' | 'SMTP_FROM_EMAIL']);
  if (missingSmtp.length > 0) {
    throw new Error(`Invalid server environment. Add SMTP configuration: ${missingSmtp.join(', ')}.`);
  }
}

export const env = {
  ...parsed.data,
  JWT_ACCESS_SECRET: parsed.data.JWT_ACCESS_SECRET || parsed.data.JWT_SECRET || 'development-only-jwt-secret-change-me-32',
  OTP_HMAC_SECRET: parsed.data.OTP_HMAC_SECRET || parsed.data.AUTH_OTP_SECRET || 'development-only-otp-secret-change-me-32',
};
