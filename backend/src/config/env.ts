import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  STORE_NAME: z.string().min(1).optional(),
  STORE_ADDRESS: z.string().min(1).optional(),
  STORE_PHONE: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  STORE_NAME: process.env.STORE_NAME,
  STORE_ADDRESS: process.env.STORE_ADDRESS,
  STORE_PHONE: process.env.STORE_PHONE,
});
