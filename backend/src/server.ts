import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { ZodError } from 'zod';
import { env } from './config/env';
import prismaPlugin from './plugins/prisma';
import registerHealthRoutes from './routes/health';
import registerAuthRoutes from './routes/auth';
import registerInventoryRoutes from './routes/inventory';

export const buildServer = () => {
  const fastify = Fastify({
    logger: true,
  });

  fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  fastify.register(prismaPlugin, {
    logQueries: env.NODE_ENV !== 'production',
  });

  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        message: 'Validation failed',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    if ('statusCode' in error) {
      reply.status(error.statusCode || 500).send({
        message: error.message,
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled error');
    reply.status(500).send({
      message: 'Internal Server Error',
    });
  });

  fastify.register(registerHealthRoutes);
  fastify.register(registerAuthRoutes);
  fastify.register(registerInventoryRoutes);

  return fastify;
};

const start = async () => {
  const server = buildServer();

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

void start();
