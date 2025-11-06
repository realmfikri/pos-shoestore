import { env } from './env';

export const reportingConfig = {
  cacheTtlSeconds: env.REPORT_CACHE_TTL_SECONDS,
  defaultDateRangeDays: 30,
  defaultTopLimit: 10,
  maxTopLimit: 50,
} as const;
