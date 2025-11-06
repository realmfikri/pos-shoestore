import fastifyPlugin from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

export type PrismaPluginOptions = {
  logQueries?: boolean;
};

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin = fastifyPlugin(
  async (fastify: FastifyInstance, options: PrismaPluginOptions) => {
    const prisma = new PrismaClient({
      log: options.logQueries ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
    });

    fastify.decorate('prisma', prisma);

    fastify.addHook('onClose', async () => {
      await prisma.$disconnect();
    });
  },
  {
    name: 'prisma',
  },
);

export default prismaPlugin;
