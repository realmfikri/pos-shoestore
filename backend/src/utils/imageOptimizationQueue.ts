import { Readable } from 'node:stream';
import PQueue from 'p-queue';
import sharp from 'sharp';
import { Client as MinioClient } from 'minio';
import { PrismaClient } from '@prisma/client';
import { MediaStatus } from '../types/mediaStatus';

export type OptimizationJob = {
  mediaId: string;
  objectKey: string;
};

type QueueOptions = {
  enabled: boolean;
  bucket: string;
  minio: MinioClient;
  prisma: PrismaClient;
  optimizedPrefix: string;
  keepOriginal: boolean;
};

const collectStream = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

const buildOptimizedKey = (prefix: string, key: string) => {
  const sanitizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return `${sanitizedPrefix}${key.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
};

export class ImageOptimizationQueue {
  private readonly queue: PQueue;
  private readonly opts: QueueOptions;

  constructor(options: QueueOptions) {
    this.opts = options;
    this.queue = new PQueue({ concurrency: 1 });
  }

  enqueue(job: OptimizationJob): void {
    if (!this.opts.enabled) {
      return;
    }

    this.queue.add(async () => {
      await this.process(job);
    });
  }

  private async process(job: OptimizationJob): Promise<void> {
    const { mediaId, objectKey } = job;

    try {
      await this.opts.prisma.media.update({
        where: { id: mediaId },
        data: { status: MediaStatus.PROCESSING, failureReason: null },
      });

      const stream = await this.opts.minio.getObject(this.opts.bucket, objectKey);
      const buffer = await collectStream(stream as Readable);

      const optimizedBuffer = await sharp(buffer)
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ effort: 4 })
        .toBuffer();

      const optimizedKey = buildOptimizedKey(this.opts.optimizedPrefix, objectKey);

      await this.opts.minio.putObject(
        this.opts.bucket,
        optimizedKey,
        optimizedBuffer,
        optimizedBuffer.length,
        {
          'Content-Type': 'image/webp',
        },
      );

      const updateData: Parameters<typeof this.opts.prisma.media.update>[0]['data'] = {
        status: MediaStatus.OPTIMIZED,
        optimizedKey,
        optimizedAt: new Date(),
        failureReason: null,
      };

      if (!this.opts.keepOriginal) {
        await this.opts.minio.removeObject(this.opts.bucket, objectKey);
        updateData.originalDeletedAt = new Date();
      }

      await this.opts.prisma.media.update({
        where: { id: mediaId },
        data: updateData,
      });
    } catch (error) {
      await this.opts.prisma.media.update({
        where: { id: job.mediaId },
        data: {
          status: MediaStatus.FAILED,
          failureReason: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
}

export const createImageOptimizationQueue = (options: QueueOptions) =>
  new ImageOptimizationQueue(options);
