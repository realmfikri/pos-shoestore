import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client', () => {
  const Role = { OWNER: 'OWNER', EMPLOYEE: 'EMPLOYEE', MANAGER: 'MANAGER' } as const;

  class PrismaClient {}

  return {
    Role,
    PrismaClient,
  };
});

import { Role, PrismaClient } from '@prisma/client';
import { MediaStatus } from '../types/mediaStatus';

let buildServer: typeof import('../server').buildServer;

const NOW = new Date('2024-01-01T00:00:00Z');
const PRODUCT_ID = '11111111-1111-1111-8111-111111111111';

class FakeMinioClient {
  uploadRequests: Array<{ bucket: string; key: string; expiry: number; metadata?: Record<string, string> }> = [];
  statCalls: Array<{ bucket: string; key: string }> = [];
  storedObjects = new Map<string, { size: number }>();

  async presignedPutObject(
    bucket: string,
    key: string,
    expiry: number,
    metadata?: Record<string, string>,
  ): Promise<string> {
    this.uploadRequests.push({ bucket, key, expiry, metadata });
    return `https://example.com/upload/${key}`;
  }

  async statObject(bucket: string, key: string): Promise<{ size: number }> {
    this.statCalls.push({ bucket, key });
    const item = this.storedObjects.get(`${bucket}:${key}`);
    if (!item) {
      throw new Error('not found');
    }
    return item;
  }

  async putObject(): Promise<void> {}
  async bucketExists(): Promise<boolean> {
    return true;
  }
  async makeBucket(): Promise<void> {}
  async getObject(): Promise<NodeJS.ReadableStream> {
    throw new Error('not implemented');
  }
  async removeObject(): Promise<void> {}
}

class FakeQueue {
  jobs: Array<{ mediaId: string; objectKey: string }> = [];

  enqueue(job: { mediaId: string; objectKey: string }): void {
    this.jobs.push(job);
  }
}

type MediaRecord = {
  id: string;
  productId: string | null;
  variantId: string | null;
  bucket: string;
  key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  status: (typeof MediaStatus)[keyof typeof MediaStatus];
  optimizedKey: string | null;
  uploadExpiresAt: Date | null;
  uploadedAt: Date | null;
  optimizedAt: Date | null;
  originalDeletedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

class FakePrismaClient {
  products = new Map<string, { id: string }>();
  variants = new Map<string, { id: string; productId: string }>();
  mediaRecords = new Map<string, MediaRecord>();

  product = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.products.get(where.id) ?? null,
  };

  variant = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.variants.get(where.id) ?? null,
  };

  media = {
    create: async ({ data }: { data: any }) => {
      const id = randomUUID();
      const record: MediaRecord = {
        ...data,
        id,
        sizeBytes: data.sizeBytes ?? null,
        optimizedKey: data.optimizedKey ?? null,
        uploadExpiresAt: data.uploadExpiresAt ?? null,
        uploadedAt: data.uploadedAt ?? null,
        optimizedAt: data.optimizedAt ?? null,
        originalDeletedAt: data.originalDeletedAt ?? null,
        failureReason: data.failureReason ?? null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      } as MediaRecord;
      this.mediaRecords.set(id, record);
      return { ...record };
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const record = this.mediaRecords.get(where.id);
      return record ? { ...record } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: any }) => {
      const existing = this.mediaRecords.get(where.id);
      if (!existing) {
        throw new Error('not found');
      }
      const updated: MediaRecord = {
        ...existing,
        ...data,
        updatedAt: new Date(NOW),
      };
      this.mediaRecords.set(where.id, updated);
      return { ...updated };
    },
    findMany: async ({ where }: { where: { productId?: string; variantId?: string } }) =>
      Array.from(this.mediaRecords.values())
        .filter((record) =>
          (where.productId ? record.productId === where.productId : true) &&
          (where.variantId ? record.variantId === where.variantId : true),
        )
        .map((record) => ({ ...record })),
  };
}

const setBaseEnv = () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-jwt-value-should-be-long-123456';
  process.env.DATABASE_URL = 'postgres://localhost/test';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_PORT = '9000';
  process.env.MINIO_USE_SSL = 'false';
  process.env.MINIO_ACCESS_KEY = 'minio';
  process.env.MINIO_SECRET_KEY = 'miniopass';
  process.env.MINIO_BUCKET = 'media';
  process.env.MEDIA_SIGNED_URL_EXPIRY_SECONDS = '900';
  process.env.MEDIA_OPTIMIZATION_ENABLED = 'false';
  process.env.MEDIA_KEEP_ORIGINAL = 'true';
  process.env.MEDIA_OPTIMIZED_PREFIX = 'optimized/';
};

beforeAll(async () => {
  setBaseEnv();
  ({ buildServer } = await import('../server'));
});

beforeEach(() => {
  setBaseEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('media routes', () => {
  it('creates a signed url and persists media placeholder', async () => {
    const prisma = new FakePrismaClient();
    const minio = new FakeMinioClient();
    const queue = new FakeQueue();
    prisma.products.set(PRODUCT_ID, { id: PRODUCT_ID });

    const server = buildServer({
      prismaClient: prisma as unknown as PrismaClient,
      minioClient: minio as unknown as any,
      imageOptimizationQueue: queue as unknown as any,
      logger: false,
      mediaOptimizationEnabled: false,
    });
    await server.ready();

    try {
      const token = server.jwt.sign({ sub: 'user-1', role: Role.OWNER });

      const response = await server.inject({
        method: 'POST',
        url: '/api/media/signed-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'example.png',
          contentType: 'image/png',
          productId: PRODUCT_ID,
        },
      });

      const body = response.json();
      expect(response.statusCode).toBe(200);
      expect(body).toHaveProperty('uploadUrl');
      expect(body).toHaveProperty('mediaId');
      expect(prisma.mediaRecords.size).toBe(1);
      expect(minio.uploadRequests).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('marks media as ready after upload when optimization disabled', async () => {
    const prisma = new FakePrismaClient();
    const minio = new FakeMinioClient();
    const queue = new FakeQueue();
    prisma.products.set(PRODUCT_ID, { id: PRODUCT_ID });

    const server = buildServer({
      prismaClient: prisma as unknown as PrismaClient,
      minioClient: minio as unknown as any,
      imageOptimizationQueue: queue as unknown as any,
      logger: false,
      mediaOptimizationEnabled: false,
    });
    await server.ready();

    try {
      const token = server.jwt.sign({ sub: 'user-1', role: Role.OWNER });

      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/media/signed-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'example.png',
          contentType: 'image/png',
          productId: PRODUCT_ID,
        },
      });
      const { mediaId, fileKey } = createResponse.json();
      minio.storedObjects.set(`media:${fileKey}`, { size: 2048 });

      const completeResponse = await server.inject({
        method: 'POST',
        url: `/api/media/${mediaId}/complete`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(completeResponse.statusCode).toBe(200);
      const completed = completeResponse.json();
      expect(completed.status).toBe(MediaStatus.READY);
      expect(queue.jobs).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('queues optimization when enabled', async () => {
    const prisma = new FakePrismaClient();
    const minio = new FakeMinioClient();
    const queue = new FakeQueue();
    prisma.products.set(PRODUCT_ID, { id: PRODUCT_ID });

    const server = buildServer({
      prismaClient: prisma as unknown as PrismaClient,
      minioClient: minio as unknown as any,
      imageOptimizationQueue: queue as unknown as any,
      logger: false,
      mediaOptimizationEnabled: true,
    });
    await server.ready();

    try {
      const token = server.jwt.sign({ sub: 'user-1', role: Role.OWNER });

      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/media/signed-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'example.png',
          contentType: 'image/png',
          productId: PRODUCT_ID,
        },
      });
      const { mediaId, fileKey } = createResponse.json();
      minio.storedObjects.set(`media:${fileKey}`, { size: 2048 });

      const completeResponse = await server.inject({
        method: 'POST',
        url: `/api/media/${mediaId}/complete`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(completeResponse.statusCode).toBe(200);
      const completed = completeResponse.json();
      expect(completed.status).toBe(MediaStatus.PROCESSING);
      expect(queue.jobs).toHaveLength(1);
      expect(queue.jobs[0]).toMatchObject({ mediaId, objectKey: fileKey });
    } finally {
      await server.close();
    }
  });

  it('lists media for a product', async () => {
    const prisma = new FakePrismaClient();
    const minio = new FakeMinioClient();
    const queue = new FakeQueue();
    prisma.products.set(PRODUCT_ID, { id: PRODUCT_ID });

    const server = buildServer({
      prismaClient: prisma as unknown as PrismaClient,
      minioClient: minio as unknown as any,
      imageOptimizationQueue: queue as unknown as any,
      logger: false,
      mediaOptimizationEnabled: false,
    });
    await server.ready();

    try {
      const token = server.jwt.sign({ sub: 'user-1', role: Role.OWNER });

      await server.inject({
        method: 'POST',
        url: '/api/media/signed-url',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fileName: 'example.png',
          contentType: 'image/png',
          productId: PRODUCT_ID,
        },
      });

      const listResponse = await server.inject({
        method: 'GET',
        url: `/api/media?productId=${PRODUCT_ID}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(listResponse.statusCode).toBe(200);
      const items = listResponse.json();
      expect(items).toHaveLength(1);
      expect(items[0].productId).toBe(PRODUCT_ID);
    } finally {
      await server.close();
    }
  });
});
