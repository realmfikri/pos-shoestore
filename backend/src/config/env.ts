import { z } from 'zod';

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false;
    }

    throw new Error(`Invalid boolean value: ${value}`);
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  STORE_NAME: z.string().min(1).optional(),
  STORE_ADDRESS: z.string().min(1).optional(),
  STORE_PHONE: z.string().min(1).optional(),
  MINIO_ENDPOINT: z.string().min(1, 'MINIO_ENDPOINT is required'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: booleanFromEnv.optional().default(false),
  MINIO_ACCESS_KEY: z.string().min(1, 'MINIO_ACCESS_KEY is required'),
  MINIO_SECRET_KEY: z.string().min(1, 'MINIO_SECRET_KEY is required'),
  MINIO_BUCKET: z.string().min(1, 'MINIO_BUCKET is required'),
  MEDIA_SIGNED_URL_EXPIRY_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  MEDIA_OPTIMIZATION_ENABLED: booleanFromEnv.optional().default(false),
  MEDIA_KEEP_ORIGINAL: booleanFromEnv.optional().default(true),
  MEDIA_OPTIMIZED_PREFIX: z.string().min(1).default('optimized/'),
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
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
  MINIO_PORT: process.env.MINIO_PORT,
  MINIO_USE_SSL: process.env.MINIO_USE_SSL,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
  MINIO_BUCKET: process.env.MINIO_BUCKET,
  MEDIA_SIGNED_URL_EXPIRY_SECONDS: process.env.MEDIA_SIGNED_URL_EXPIRY_SECONDS,
  MEDIA_OPTIMIZATION_ENABLED: process.env.MEDIA_OPTIMIZATION_ENABLED,
  MEDIA_KEEP_ORIGINAL: process.env.MEDIA_KEEP_ORIGINAL,
  MEDIA_OPTIMIZED_PREFIX: process.env.MEDIA_OPTIMIZED_PREFIX,
});
