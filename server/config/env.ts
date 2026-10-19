import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  CLIENT_URL: z.string().url(),
  CLERK_SECRET_KEY: z.string().min(1),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1).optional(),
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
