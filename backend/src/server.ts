import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { ZodError } from 'zod';
import { env } from './config/env';
import prismaPlugin from './plugins/prisma';
import registerHealthRoutes from './routes/health';
import registerAuthRoutes from './routes/auth';
import registerInventoryRoutes from './routes/inventory';
import registerPurchasingRoutes from './routes/purchasing';
import { PrismaClient } from '@prisma/client';

export type BuildServerOptions = {
  prismaClient?: PrismaClient;
  logger?: boolean;
};

const registerPrisma = (fastify: FastifyInstance, prismaClient?: PrismaClient) => {
  if (prismaClient) {
    fastify.decorate('prisma', prismaClient);
    fastify.addHook('onClose', async () => {
      if (typeof fastify.prisma.$disconnect === 'function') {
        await fastify.prisma.$disconnect();
      }
    });
    return;
  }

  fastify.register(prismaPlugin, {
    logQueries: env.NODE_ENV !== 'production',
  });
};

export const buildServer = (options: BuildServerOptions = {}) => {
  const fastify = Fastify({
    logger: options.logger ?? true,
  });

  fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  registerPrisma(fastify, options.prismaClient);

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
  fastify.register(registerPurchasingRoutes);

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
