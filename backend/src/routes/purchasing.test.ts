import { describe, expect, beforeAll, beforeEach, afterEach, it, vi } from 'vitest';

vi.mock('@prisma/client', () => {
  const Role = { OWNER: 'OWNER', MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE' } as const;
  const StockLedgerType = {
    INITIAL_COUNT: 'INITIAL_COUNT',
    ADJUSTMENT: 'ADJUSTMENT',
    RECEIPT: 'RECEIPT',
    SALE: 'SALE',
  } as const;
  const PurchaseOrderStatus = {
    DRAFT: 'DRAFT',
    PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
    RECEIVED: 'RECEIVED',
    CANCELLED: 'CANCELLED',
  } as const;

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

  class PrismaClientKnownRequestError extends Error {
    code: string;

    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    Role,
    StockLedgerType,
    PurchaseOrderStatus,
    PrismaClient,
    Prisma: {
      sql,
      join,
      PrismaClientKnownRequestError,
    },
  };
});

import { randomUUID } from 'crypto';
import {
  GoodsReceipt,
  GoodsReceiptItem,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Role,
  StockLedger,
  StockLedgerType,
  Supplier,
  Variant,
  PrismaClient,
} from '@prisma/client';

let buildServer: typeof import('../server').buildServer;

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
  ({ buildServer } = await import('../server'));
});

class FakePrismaClient {
  suppliers = new Map<string, Supplier>();
  variants = new Map<string, Variant>();
  purchaseOrders = new Map<string, PurchaseOrder>();
  purchaseOrderItems = new Map<string, PurchaseOrderItem>();
  goodsReceipts = new Map<string, GoodsReceipt>();
  goodsReceiptItems = new Map<string, GoodsReceiptItem>();
  stockLedgerEntries: StockLedger[] = [];

  supplier = {
    create: async ({
      data,
    }: {
      data: Partial<Supplier> & { name: string; id?: string };
    }): Promise<Supplier> => {
      const now = new Date();
      const record: Supplier = {
        id: data.id ?? randomUUID(),
        name: data.name,
        contact: data.contact ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.suppliers.set(record.id, record);
      return { ...record };
    },
    findMany: async (): Promise<Supplier[]> => Array.from(this.suppliers.values()).map((record) => ({ ...record })),
    findUnique: async ({ where }: { where: { id: string } }): Promise<Supplier | null> => {
      const record = this.suppliers.get(where.id);
      return record ? { ...record } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Supplier> }): Promise<Supplier> => {
      const existing = this.suppliers.get(where.id);
      if (!existing) {
        throw new Error('Not found');
      }
      const updated: Supplier = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.suppliers.set(updated.id, updated);
      return { ...updated };
    },
    delete: async ({ where }: { where: { id: string } }): Promise<Supplier> => {
      const existing = this.suppliers.get(where.id);
      if (!existing) {
        throw new Error('Not found');
      }
      this.suppliers.delete(where.id);
      return { ...existing };
    },
  };

  variant = {
    findUnique: async ({ where }: { where: { id?: string; sku?: string } }): Promise<Variant | null> => {
      const key = where.id ?? Array.from(this.variants.values()).find((variant) => variant.sku === where.sku)?.id;
      if (!key) {
        return null;
      }
      const record = this.variants.get(key);
      return record ? { ...record } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Variant> }): Promise<Variant> => {
      const existing = this.variants.get(where.id);
      if (!existing) {
        throw new Error('Not found');
      }
      const updated: Variant = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.variants.set(updated.id, updated);
      return { ...updated };
    },
  };

  purchaseOrder = {
    create: async ({
      data,
    }: {
      data: Partial<PurchaseOrder> & { supplierId: string; createdById: string; id?: string };
    }): Promise<PurchaseOrder> => {
      const now = new Date();
      const record: PurchaseOrder = {
        id: data.id ?? randomUUID(),
        supplierId: data.supplierId,
        createdById: data.createdById,
        status: data.status ?? PurchaseOrderStatus.DRAFT,
        orderedAt: data.orderedAt ?? null,
        receivedAt: data.receivedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.purchaseOrders.set(record.id, record);
      return { ...record };
    },
    findMany: async (): Promise<PurchaseOrder[]> =>
      Array.from(this.purchaseOrders.values()).map((record) => ({ ...record })),
    findUnique: async ({ where }: { where: { id: string } }): Promise<PurchaseOrder | null> => {
      const record = this.purchaseOrders.get(where.id);
      return record ? { ...record } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PurchaseOrder> }): Promise<PurchaseOrder> => {
      const existing = this.purchaseOrders.get(where.id);
      if (!existing) {
        throw new Error('Not found');
      }
      const updated: PurchaseOrder = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.purchaseOrders.set(updated.id, updated);
      return { ...updated };
    },
  };

  purchaseOrderItem = {
    create: async ({
      data,
    }: {
      data: Partial<PurchaseOrderItem> & {
        purchaseOrderId: string;
        variantId: string;
        quantityOrdered: number;
        id?: string;
      };
    }): Promise<PurchaseOrderItem> => {
      const now = new Date();
      const record: PurchaseOrderItem = {
        id: data.id ?? randomUUID(),
        purchaseOrderId: data.purchaseOrderId,
        variantId: data.variantId,
        quantityOrdered: data.quantityOrdered,
        quantityReceived: data.quantityReceived ?? 0,
        costCents: data.costCents ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.purchaseOrderItems.set(record.id, record);
      return { ...record };
    },
    createMany: async ({
      data,
    }: {
      data: Array<
        Partial<PurchaseOrderItem> & {
          purchaseOrderId: string;
          variantId: string;
          quantityOrdered: number;
          id?: string;
        }
      >;
    }): Promise<{ count: number }> => {
      for (const entry of data) {
        void this.purchaseOrderItem.create({ data: entry });
      }
      return { count: data.length };
    },
    findMany: async ({ where }: { where: { purchaseOrderId?: string; id?: string; variantId?: string } }): Promise<PurchaseOrderItem[]> => {
      const records = Array.from(this.purchaseOrderItems.values()).filter((item) => {
        if (where.purchaseOrderId && item.purchaseOrderId !== where.purchaseOrderId) {
          return false;
        }
        if (where.id && item.id !== where.id) {
          return false;
        }
        if (where.variantId && item.variantId !== where.variantId) {
          return false;
        }
        return true;
      });
      return records.map((record) => ({ ...record }));
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PurchaseOrderItem> }): Promise<PurchaseOrderItem> => {
      const existing = this.purchaseOrderItems.get(where.id);
      if (!existing) {
        throw new Error('Not found');
      }
      const updated: PurchaseOrderItem = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.purchaseOrderItems.set(updated.id, updated);
      return { ...updated };
    },
  };

  goodsReceipt = {
    create: async ({
      data,
    }: {
      data: Partial<GoodsReceipt> & { purchaseOrderId: string; id?: string };
    }): Promise<GoodsReceipt> => {
      const now = new Date();
      const record: GoodsReceipt = {
        id: data.id ?? randomUUID(),
        purchaseOrderId: data.purchaseOrderId,
        receivedById: data.receivedById ?? null,
        receivedAt: data.receivedAt ?? now,
        createdAt: data.createdAt ?? now,
      };
      this.goodsReceipts.set(record.id, record);
      return { ...record };
    },
    findMany: async ({ where }: { where: { purchaseOrderId?: string } }): Promise<GoodsReceipt[]> => {
      const records = Array.from(this.goodsReceipts.values()).filter((receipt) => {
        if (where.purchaseOrderId && receipt.purchaseOrderId !== where.purchaseOrderId) {
          return false;
        }
        return true;
      });
      return records.map((record) => ({ ...record }));
    },
  };

  goodsReceiptItem = {
    create: async ({
      data,
    }: {
      data: Partial<GoodsReceiptItem> & {
        goodsReceiptId: string;
        purchaseOrderItemId: string;
        quantityReceived: number;
        id?: string;
      };
    }): Promise<GoodsReceiptItem> => {
      const now = new Date();
      const record: GoodsReceiptItem = {
        id: data.id ?? randomUUID(),
        goodsReceiptId: data.goodsReceiptId,
        purchaseOrderItemId: data.purchaseOrderItemId,
        quantityReceived: data.quantityReceived,
        costCents: data.costCents ?? null,
        createdAt: data.createdAt ?? now,
      };
      this.goodsReceiptItems.set(record.id, record);
      return { ...record };
    },
    findMany: async ({ where }: { where: { goodsReceiptId?: string; purchaseOrderItemId?: string } }): Promise<GoodsReceiptItem[]> => {
      const records = Array.from(this.goodsReceiptItems.values()).filter((item) => {
        if (where.goodsReceiptId && item.goodsReceiptId !== where.goodsReceiptId) {
          return false;
        }
        if (where.purchaseOrderItemId && item.purchaseOrderItemId !== where.purchaseOrderItemId) {
          return false;
        }
        return true;
      });
      return records.map((record) => ({ ...record }));
    },
  };

  stockLedger = {
    create: async ({
      data,
    }: {
      data: Partial<StockLedger> & { variantId: string; quantityChange: number; type?: StockLedgerType; id?: string };
    }): Promise<StockLedger> => {
      const now = new Date();
      const record: StockLedger = {
        id: data.id ?? randomUUID(),
        variantId: data.variantId,
        recordedById: data.recordedById ?? null,
        quantityChange: data.quantityChange,
        type: data.type ?? StockLedgerType.RECEIPT,
        reason: data.reason ?? null,
        reference: data.reference ?? null,
        createdAt: data.createdAt ?? now,
      };
      this.stockLedgerEntries.push(record);
      return { ...record };
    },
    findMany: async ({ where }: { where?: { variantId?: string } } = {}): Promise<StockLedger[]> => {
      const records = this.stockLedgerEntries.filter((entry) => {
        if (where?.variantId && entry.variantId !== where.variantId) {
          return false;
        }
        return true;
      });
      return records.map((record) => ({ ...record }));
    },
  };

  async $transaction<T>(callback: (client: FakePrismaClient) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async $disconnect(): Promise<void> {}

  seedVariant(variant: Variant): void {
    this.variants.set(variant.id, variant);
  }

  getOnHand(variantId: string): number {
    return this.stockLedgerEntries
      .filter((entry) => entry.variantId === variantId)
      .reduce((total, entry) => total + entry.quantityChange, 0);
  }
}

describe('purchase order receiving flow', () => {
  const VARIANT_ID = '123e4567-e89b-12d3-a456-426614174000';
  let prisma: FakePrismaClient;
  let server: ReturnType<typeof buildServer>;
  let token: string;

  beforeEach(async () => {
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
    prisma = new FakePrismaClient();
    const minio = {};
    const queue = { enqueue: () => {} };
    const now = new Date();
    prisma.seedVariant({
      id: VARIANT_ID,
      productId: 'product-1',
      sku: 'SKU-123',
      size: null,
      color: null,
      priceCents: 1000,
      costPriceCents: null,
      barcode: null,
      createdAt: now,
      updatedAt: now,
    });
    server = buildServer({
      prismaClient: prisma as unknown as PrismaClient,
      minioClient: minio as any,
      imageOptimizationQueue: queue as any,
      mediaOptimizationEnabled: false,
      logger: false,
    });
    await server.ready();
    token = server.jwt.sign({ sub: 'owner-1', role: Role.OWNER });
  });

  afterEach(async () => {
    await server.close();
  });

  it('receives a purchase order and updates stock ledger and variant cost', async () => {
    const supplierResponse = await server.inject({
      method: 'POST',
      url: '/api/suppliers',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Test Supplier',
        email: 'supplier@example.com',
      },
    });

    expect(supplierResponse.statusCode).toBe(201);
    const supplier = supplierResponse.json() as Supplier;

    const purchaseOrderResponse = await server.inject({
      method: 'POST',
      url: '/api/po',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        supplierId: supplier.id,
        items: [
          {
            variantId: VARIANT_ID,
            quantityOrdered: 5,
            costCents: 600,
          },
        ],
      },
    });

    expect(purchaseOrderResponse.statusCode).toBe(201);
    const purchaseOrder = purchaseOrderResponse.json() as {
      id: string;
      status: PurchaseOrderStatus;
      items: PurchaseOrderItem[];
    };

    expect(purchaseOrder.status).toBe(PurchaseOrderStatus.DRAFT);
    expect(purchaseOrder.items).toHaveLength(1);

    const receiveResponse = await server.inject({
      method: 'POST',
      url: `/api/po/${purchaseOrder.id}/receive`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            itemId: purchaseOrder.items[0].id,
            quantityReceived: 5,
            costCents: 650,
          },
        ],
      },
    });

    expect(receiveResponse.statusCode).toBe(200);
    const receivedOrder = receiveResponse.json() as {
      status: PurchaseOrderStatus;
      items: PurchaseOrderItem[];
      receipts: Array<GoodsReceipt & { items: GoodsReceiptItem[] }>;
    };

    expect(receivedOrder.status).toBe(PurchaseOrderStatus.RECEIVED);
    expect(receivedOrder.items[0].quantityReceived).toBe(5);
    expect(receivedOrder.receipts).toHaveLength(1);
    expect(receivedOrder.receipts[0].items[0].quantityReceived).toBe(5);
    expect(receivedOrder.receipts[0].items[0].costCents).toBe(650);

    expect(prisma.getOnHand(VARIANT_ID)).toBe(5);

    const ledgerEntries = await prisma.stockLedger.findMany({ where: { variantId: VARIANT_ID } });
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].reason).toBe('purchase');
    expect(ledgerEntries[0].reference).toBe(receivedOrder.receipts[0].id);

    const variant = await prisma.variant.findUnique({ where: { id: VARIANT_ID } });
    expect(variant?.costPriceCents).toBe(650);
  });
});
