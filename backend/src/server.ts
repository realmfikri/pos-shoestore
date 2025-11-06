import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env } from './config/env';
import prismaPlugin from './plugins/prisma';
import minioPlugin from './plugins/minio';
import imageOptimizationPlugin from './plugins/imageOptimization';
import registerHealthRoutes from './routes/health';
import registerAuthRoutes from './routes/auth';
import registerInventoryRoutes from './routes/inventory';
import registerPurchasingRoutes from './routes/purchasing';
import registerSalesRoutes from './routes/sales';
import registerMediaRoutes from './routes/media';
import { PrismaClient } from '@prisma/client';
import { Client as MinioClient } from 'minio';
import { ImageOptimizationQueue } from './utils/imageOptimizationQueue';

export type BuildServerOptions = {
  prismaClient?: PrismaClient;
  logger?: boolean;
  minioClient?: MinioClient;
  imageOptimizationQueue?: ImageOptimizationQueue;
  mediaOptimizationEnabled?: boolean;
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

const registerMinio = (fastify: FastifyInstance, minioClient?: MinioClient) => {
  if (minioClient) {
    fastify.decorate('minio', minioClient);
    fastify.decorate('mediaBucket', env.MINIO_BUCKET);
    return;
  }

  fastify.register(minioPlugin);
};

const registerImageOptimization = (
  fastify: FastifyInstance,
  queue?: ImageOptimizationQueue,
) => {
  if (queue) {
    fastify.decorate('imageOptimizationQueue', queue);
    return;
  }

  fastify.register(imageOptimizationPlugin);
};

export const buildServer = (options: BuildServerOptions = {}) => {
  const fastify = Fastify({
    logger: options.logger ?? true,
  });

  fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });

  registerPrisma(fastify, options.prismaClient);
  fastify.decorate('mediaOptimizationEnabled', options.mediaOptimizationEnabled ?? env.MEDIA_OPTIMIZATION_ENABLED);
  registerMinio(fastify, options.minioClient);
  registerImageOptimization(fastify, options.imageOptimizationQueue);

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
  fastify.register(registerSalesRoutes);
  fastify.register(registerMediaRoutes);

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

if (env.NODE_ENV !== 'test') {
  void start();
}
