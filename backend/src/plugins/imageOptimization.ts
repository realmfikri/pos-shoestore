import fp from 'fastify-plugin';
import { env } from '../config/env';
import {
  createImageOptimizationQueue,
  ImageOptimizationQueue,
} from '../utils/imageOptimizationQueue';

declare module 'fastify' {
  interface FastifyInstance {
    imageOptimizationQueue: ImageOptimizationQueue;
    mediaOptimizationEnabled: boolean;
  }
}

type ImageOptimizationOptions = {
  queueOverride?: ImageOptimizationQueue;
};

const imageOptimizationPlugin = fp<ImageOptimizationOptions>(
  async (fastify, opts) => {
    if (opts.queueOverride) {
      fastify.decorate('imageOptimizationQueue', opts.queueOverride);
      return;
    }

    const queue = createImageOptimizationQueue({
      enabled: fastify.mediaOptimizationEnabled,
      bucket: fastify.mediaBucket,
      minio: fastify.minio,
      prisma: fastify.prisma,
      optimizedPrefix: env.MEDIA_OPTIMIZED_PREFIX,
      keepOriginal: env.MEDIA_KEEP_ORIGINAL,
    });

    fastify.decorate('imageOptimizationQueue', queue);
  },
  {
    name: 'image-optimization',
    dependencies: ['minio'],
  },
);

export default imageOptimizationPlugin;
