import 'fastify';
import type { ReportCache } from '../utils/cache';

declare module 'fastify' {
  interface FastifyInstance {
    reportCache: ReportCache;
  }
}
