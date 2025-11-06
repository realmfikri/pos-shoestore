import { FastifyInstance } from 'fastify';

const registerHealthRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get('/healthz', async () => ({ status: 'ok' }));
  fastify.get('/readyz', async () => ({ status: 'ready' }));
};

export default registerHealthRoutes;
