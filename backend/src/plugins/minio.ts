import fp from 'fastify-plugin';
import { Client } from 'minio';
import { env } from '../config/env';

declare module 'fastify' {
  interface FastifyInstance {
    minio: Client;
    mediaBucket: string;
  }
}

const minioPlugin = fp(
  async (fastify) => {
    const client = new Client({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });

  try {
    const exists = await client.bucketExists(env.MINIO_BUCKET);
    if (!exists) {
      await client.makeBucket(env.MINIO_BUCKET, '');
    }
  } catch (error) {
    fastify.log.error({ err: error }, 'Failed to ensure MinIO bucket');
    throw error;
  }

    fastify.decorate('minio', client);
    fastify.decorate('mediaBucket', env.MINIO_BUCKET);
  },
  {
    name: 'minio',
  },
);

export default minioPlugin;
