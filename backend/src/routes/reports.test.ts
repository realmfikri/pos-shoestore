import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from 'vitest';

vi.mock('@prisma/client', () => {
  const Role = { OWNER: 'OWNER', MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE' } as const;

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
  const join = (
    values: Array<{ strings: TemplateStringsArray; values: unknown[] }>,
    separator: { strings: TemplateStringsArray; values: unknown[] },
  ) => {
    const text = values
      .map((value) => value.strings.join(''))
      .join(separator.strings.join(''));
    const joinedValues = values.flatMap((value) => value.values);
    return { strings: [text] as unknown as TemplateStringsArray, values: joinedValues };
  };

  class PrismaClient {}

  return {
    Role,
    PrismaClient,
    Prisma: {
      sql,
      join,
    },
  };
});

import { PrismaClient, Role } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { Client as MinioClient } from 'minio';
import type { ReportCache } from '../utils/cache';
import type { ImageOptimizationQueue } from '../utils/imageOptimizationQueue';
import type {
  DailySalesRow,
  LowStockRow,
  TopSellingBrandRow,
  TopSellingItemRow,
} from '../services/reporting';

class FakePrismaClient {
  dailySalesRows: DailySalesRow[] = [];
  topItemRows: TopSellingItemRow[] = [];
  topBrandRows: TopSellingBrandRow[] = [];
  lowStockRows: LowStockRow[] = [];
  lastQuery: { text: string; values: unknown[] } | null = null;

  async $queryRaw<T>(query: { strings: TemplateStringsArray; values: unknown[] }): Promise<T> {
    const text = query.strings.join('');
    this.lastQuery = { text, values: query.values };

    if (text.includes('FROM daily_sales_totals')) {
      return this.dailySalesRows as unknown as T;
    }

    if (text.includes('FROM sale_item_daily_metrics')) {
      return this.topItemRows as unknown as T;
    }

    if (text.includes('FROM brand_daily_metrics')) {
      return this.topBrandRows as unknown as T;
    }

    if (text.includes('FROM low_stock_variants')) {
      return this.lowStockRows as unknown as T;
    }

    throw new Error(`Unexpected query: ${text}`);
  }

  async $disconnect() {}
}

const collectDates = (input: unknown): Date[] => {
  if (!input) {
    return [];
  }

  if (input instanceof Date) {
    return [input];
  }

  if (Array.isArray(input)) {
    return input.flatMap((value) => collectDates(value));
  }

  if (typeof input === 'object') {
    const record = input as { values?: unknown };
    if ('values' in record) {
      return collectDates(record.values);
    }
  }

  return [];
};

class FakeReportCache implements ReportCache {
  store = new Map<string, unknown>();
  hits = 0;
  wildcardKey = '__any__';

  async get<T>(key: string): Promise<T | null> {
    if (this.store.has(key)) {
      this.hits += 1;
      return this.store.get(key) as T;
    }

     if (this.store.has(this.wildcardKey)) {
       this.hits += 1;
       return this.store.get(this.wildcardKey) as T;
     }
    return null;
  }

  async set<T>(key: string, value: T, _ttlSeconds: number): Promise<void> {
    this.store.set(key, value);
  }

  async invalidate(_prefix?: string): Promise<void> {
    this.store.clear();
  }
}

let buildServer: typeof import('../server').buildServer;
let server: FastifyInstance;
let prisma: FakePrismaClient;
let cache: FakeReportCache;
let token: string;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-jwt-value-should-be-long-123456';
  process.env.DATABASE_URL = 'postgres://localhost/test';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_PORT = '9000';
  process.env.MINIO_ACCESS_KEY = 'minio';
  process.env.MINIO_SECRET_KEY = 'miniopass';
  process.env.MINIO_BUCKET = 'media';
  process.env.MINIO_USE_SSL = 'false';
  process.env.MEDIA_SIGNED_URL_EXPIRY_SECONDS = '900';
  process.env.MEDIA_OPTIMIZATION_ENABLED = 'false';
  process.env.MEDIA_KEEP_ORIGINAL = 'true';
  process.env.MEDIA_OPTIMIZED_PREFIX = 'optimized/';
  process.env.REPORT_CACHE_TTL_SECONDS = '60';
  ({ buildServer } = await import('../server'));
});

beforeEach(async () => {
  prisma = new FakePrismaClient();
  cache = new FakeReportCache();
  const queue: Pick<ImageOptimizationQueue, 'enqueue'> = {
    enqueue: async () => {},
  };
  server = buildServer({
    prismaClient: prisma as unknown as PrismaClient,
    logger: false,
    reportCache: cache,
    minioClient: {} as unknown as MinioClient,
    mediaOptimizationEnabled: false,
    imageOptimizationQueue: queue as ImageOptimizationQueue,
  });
  await server.ready();
  token = server.jwt.sign({ sub: 'user-1', role: Role.OWNER });
});

afterEach(async () => {
  await server.close();
});

describe('GET /api/reports/sales/daily', () => {
  it('returns aggregated daily totals within the requested range', async () => {
    prisma.dailySalesRows = [
      {
        saleDate: new Date('2025-04-29T00:00:00Z'),
        grossSalesCents: 15000,
        discountTotalCents: 500,
        taxTotalCents: 750,
        netSalesCents: 15250,
        saleCount: 3,
      },
    ];

    const response = await server.inject({
      method: 'GET',
      url: '/api/reports/sales/daily?startDate=2025-04-01T00:00:00.000Z&endDate=2025-04-30T23:59:59.000Z',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.lastQuery?.text).toContain('FROM daily_sales_totals');
    const dates = collectDates(prisma.lastQuery?.values ?? []);
    expect(dates).toEqual([
      new Date('2025-04-01T00:00:00.000Z'),
      new Date('2025-04-30T23:59:59.000Z'),
    ]);
    expect(response.json()).toEqual({
      results: [
        {
          saleDate: '2025-04-29T00:00:00.000Z',
          grossSalesCents: 15000,
          discountTotalCents: 500,
          taxTotalCents: 750,
          netSalesCents: 15250,
          saleCount: 3,
        },
      ],
    });
  });

  it('returns an empty result when there are no sales', async () => {
    prisma.dailySalesRows = [];

    const response = await server.inject({
      method: 'GET',
      url: '/api/reports/sales/daily?startDate=2025-04-01T00:00:00.000Z&endDate=2025-04-02T00:00:00.000Z',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [] });
  });

  it('rejects requests where startDate is after endDate', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/reports/sales/daily?startDate=2025-05-02T00:00:00.000Z&endDate=2025-05-01T00:00:00.000Z',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'startDate must be before or equal to endDate',
    });
  });
});

describe('GET /api/reports/sales/top-items', () => {
  it('returns the most popular variants by quantity', async () => {
    prisma.topItemRows = [
      {
        variantId: 'variant-1',
        productId: 'product-1',
        brandId: 'brand-1',
        sku: 'SKU-1',
        productName: 'Sneaker A',
        brandName: 'Brand A',
        quantitySold: 12,
        grossSalesCents: 120000,
        discountTotalCents: 5000,
        netSalesCents: 115000,
        lastSoldAt: new Date('2025-04-30T12:34:00Z'),
      },
    ];

    const response = await server.inject({
      method: 'GET',
      url: '/api/reports/sales/top-items?limit=5&startDate=2025-04-01T00:00:00.000Z&endDate=2025-04-30T23:59:59.000Z',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.lastQuery?.text).toContain('FROM sale_item_daily_metrics');
    const dates = collectDates(prisma.lastQuery?.values ?? []);
    expect(dates.slice(0, 2)).toEqual([
      new Date('2025-04-01T00:00:00.000Z'),
      new Date('2025-04-30T23:59:59.000Z'),
    ]);
    expect(response.json()).toEqual({
      results: [
        {
          variantId: 'variant-1',
          productId: 'product-1',
          brandId: 'brand-1',
          sku: 'SKU-1',
          productName: 'Sneaker A',
          brandName: 'Brand A',
          quantitySold: 12,
          grossSalesCents: 120000,
          discountTotalCents: 5000,
          netSalesCents: 115000,
          lastSoldAt: '2025-04-30T12:34:00.000Z',
        },
      ],
    });
  });

  it('uses cached responses when available', async () => {
    const cachedPayload = { results: [] };
    cache.store.set(cache.wildcardKey, cachedPayload);

    const response = await server.inject({
      method: 'GET',
      url: '/api/reports/sales/top-items',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(cachedPayload);
    expect(prisma.lastQuery).toBeNull();
  });
});

describe('GET /api/reports/sales/top-brands', () => {
  it('returns top brands across the supplied range', async () => {
    prisma.topBrandRows = [
      {
        brandId: 'brand-1',
        brandName: 'Brand A',
        quantitySold: 20,
        grossSalesCents: 220000,
        discountTotalCents: 10000,
        netSalesCents: 210000,
      },
    ];

    const response = await server.inject({
      method: 'GET',
      url: '/api/reports/sales/top-brands?startDate=2025-04-01T00:00:00.000Z&endDate=2025-04-30T23:59:59.000Z',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.lastQuery?.text).toContain('FROM brand_daily_metrics');
    expect(response.json()).toEqual({
      results: [
        {
          brandId: 'brand-1',
          brandName: 'Brand A',
          quantitySold: 20,
          grossSalesCents: 220000,
          discountTotalCents: 10000,
          netSalesCents: 210000,
        },
      ],
    });
  });
});

describe('GET /api/reports/inventory/low-stock', () => {
  it('returns variants below the configured threshold', async () => {
    prisma.lowStockRows = [
      {
        variantId: 'variant-1',
        productId: 'product-1',
        brandId: 'brand-1',
        sku: 'SKU-1',
        productName: 'Sneaker A',
        brandName: 'Brand A',
        onHand: 2,
        threshold: 5,
      },
    ];

    const response = await server.inject({
      method: 'GET',
      url: '/api/reports/inventory/low-stock',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.lastQuery?.text).toContain('FROM low_stock_variants');
    expect(response.json()).toEqual({
      results: [
        {
          variantId: 'variant-1',
          productId: 'product-1',
          brandId: 'brand-1',
          sku: 'SKU-1',
          productName: 'Sneaker A',
          brandName: 'Brand A',
          onHand: 2,
          threshold: 5,
        },
      ],
    });
  });
});
