import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    httpErrors: {
      badRequest(message?: string): Error;
      unauthorized?(message?: string): Error;
      notFound?(message?: string): Error;
      conflict?(message?: string): Error;
      [key: string]: (...args: unknown[]) => Error;
    };
  }
}
