import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from 'vitest';

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
  PrismaClient,
  Role,
  Sale,
  SaleItem,
  StockLedger,
  StockLedgerType,
  Variant,
} from '@prisma/client';

let buildServer: typeof import('../server').buildServer;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-jwt-value-should-be-long-123456';
  process.env.DATABASE_URL = 'postgres://localhost/test';
  ({ buildServer } = await import('../server'));
});

class FakePrismaClient {
  variants = new Map<string, Variant & { productName: string; brandId: string; brandName: string }>();
  sales = new Map<string, Sale>();
  saleItems = new Map<string, SaleItem>();
  stockLedgerEntries: StockLedger[] = [];
  throwOnLedgerCreate = false;

  variant = {
    findUnique: async ({ where }: { where: { id?: string } }): Promise<Variant | null> => {
      if (!where.id) {
        return null;
      }
      const record = this.variants.get(where.id);
      if (!record) {
        return null;
      }
      const { productName: _productName, brandName: _brandName, ...variant } = record;
      return { ...variant };
    },
  };

  sale = {
    create: async ({
      data,
    }: {
      data: Partial<Sale> & {
        id?: string;
        subtotalCents: number;
        saleDiscountCents: number;
        discountTotalCents: number;
        taxTotalCents: number;
        totalCents: number;
        paymentBreakdown: unknown;
        recordedById?: string | null;
      };
    }): Promise<Sale> => {
      const now = new Date();
      const record: Sale = {
        id: data.id ?? randomUUID(),
        recordedById: data.recordedById ?? null,
        subtotalCents: data.subtotalCents,
        saleDiscountCents: data.saleDiscountCents,
        discountTotalCents: data.discountTotalCents,
        taxTotalCents: data.taxTotalCents,
        totalCents: data.totalCents,
        paymentBreakdown: data.paymentBreakdown,
        createdAt: now,
        updatedAt: now,
      };
      this.sales.set(record.id, record);
      return { ...record };
    },
    findUnique: async ({ where }: { where: { id: string } }): Promise<Sale | null> => {
      const record = this.sales.get(where.id);
      return record ? { ...record } : null;
    },
  };

  saleItem = {
    create: async ({
      data,
    }: {
      data: Partial<SaleItem> & {
        id?: string;
        saleId: string;
        variantId: string;
        quantity: number;
        unitPriceCents: number;
        discountCents: number;
      };
    }): Promise<SaleItem> => {
      const now = new Date();
      const record: SaleItem = {
        id: data.id ?? randomUUID(),
        saleId: data.saleId,
        variantId: data.variantId,
        quantity: data.quantity,
        unitPriceCents: data.unitPriceCents,
        discountCents: data.discountCents,
        createdAt: now,
      };
      this.saleItems.set(record.id, record);
      return { ...record };
    },
    findMany: async ({ where }: { where: { saleId?: string } }): Promise<SaleItem[]> => {
      const items = Array.from(this.saleItems.values()).filter((item) => {
        if (where.saleId && item.saleId !== where.saleId) {
          return false;
        }
        return true;
      });
      return items.map((item) => ({ ...item }));
    },
  };

  stockLedger = {
    create: async ({
      data,
    }: {
      data: Partial<StockLedger> & {
        id?: string;
        variantId: string;
        quantityChange: number;
        type: StockLedgerType;
        recordedById?: string | null;
      };
    }): Promise<StockLedger> => {
      if (this.throwOnLedgerCreate) {
        throw new Error('ledger failure');
      }
      const now = new Date();
      const record: StockLedger = {
        id: data.id ?? randomUUID(),
        variantId: data.variantId,
        recordedById: data.recordedById ?? null,
        quantityChange: data.quantityChange,
        type: data.type,
        reason: data.reason ?? null,
        reference: data.reference ?? null,
        createdAt: now,
      };
      this.stockLedgerEntries.push(record);
      return { ...record };
    },
    findMany: async ({ where }: { where?: { variantId?: string } } = {}): Promise<StockLedger[]> => {
      const entries = this.stockLedgerEntries.filter((entry) => {
        if (where?.variantId && entry.variantId !== where.variantId) {
          return false;
        }
        return true;
      });
      return entries.map((entry) => ({ ...entry }));
    },
  };

  async $transaction<T>(callback: (client: FakePrismaClient) => Promise<T>): Promise<T> {
    const snapshot = {
      sales: new Map(this.sales),
      saleItems: new Map(this.saleItems),
      stockLedgerEntries: [...this.stockLedgerEntries],
    };

    try {
      const result = await callback(this);
      return result;
    } catch (error) {
      this.sales = new Map(snapshot.sales);
      this.saleItems = new Map(snapshot.saleItems);
      this.stockLedgerEntries = [...snapshot.stockLedgerEntries];
      throw error;
    }
  }

  async $disconnect(): Promise<void> {}

  private normalizeQuery(query: unknown): { text: string; values: unknown[] } {
    if (query && typeof query === 'object' && 'strings' in query && 'values' in query) {
      const sqlQuery = query as { strings: TemplateStringsArray; values: unknown[] };
      return { text: sqlQuery.strings.join(''), values: sqlQuery.values };
    }
    if (typeof query === 'object' && query !== null && 'raw' in query) {
      const rawQuery = query as { raw: string };
      return { text: rawQuery.raw, values: [] };
    }
    return { text: String(query), values: [] };
  }

  async $queryRaw<T = unknown>(query: unknown): Promise<T> {
    const { text, values } = this.normalizeQuery(query);

    if (text.includes('WHERE v."id" =') && text.includes('LIMIT 1')) {
      const variantId = values[0] as string;
      const record = this.variants.get(variantId);
      if (!record) {
        return [] as T;
      }
      const onHand = this.getOnHand(variantId);
      return ([
        {
          variantId: record.id,
          productId: record.productId,
          brandId: record.brandId,
          sku: record.sku,
          barcode: record.barcode,
          priceCents: record.priceCents,
          productName: record.productName,
          brandName: record.brandName,
          size: record.size,
          color: record.color,
          onHand,
        },
      ] as unknown) as T;
    }

    if (text.includes('WHERE v."barcode" =')) {
      const barcode = values[0] as string;
      const record = Array.from(this.variants.values()).find((variant) => variant.barcode === barcode);
      if (!record) {
        return [] as T;
      }
      const onHand = this.getOnHand(record.id);
      return ([
        {
          variantId: record.id,
          productId: record.productId,
          brandId: record.brandId,
          sku: record.sku,
          barcode: record.barcode,
          priceCents: record.priceCents,
          productName: record.productName,
          brandName: record.brandName,
          size: record.size,
          color: record.color,
          onHand,
        },
      ] as unknown) as T;
    }

    if (text.includes('WHERE v."id" IN (')) {
      const ids = values as string[];
      const rows = ids
        .map((id) => this.variants.get(id))
        .filter((record): record is Variant & { productName: string; brandId: string; brandName: string } => !!record)
        .map((record) => ({
          variantId: record.id,
          sku: record.sku,
          productName: record.productName,
        }));
      return rows as T;
    }

    throw new Error(`Unsupported raw query: ${text}`);
  }

  seedVariant(variant: Variant & { productName: string; brandId: string; brandName: string }): void {
    this.variants.set(variant.id, { ...variant });
  }

  recordStock(variantId: string, quantityChange: number, type: StockLedgerType): void {
    const entry: StockLedger = {
      id: randomUUID(),
      variantId,
      recordedById: null,
      quantityChange,
      type,
      reason: null,
      reference: null,
      createdAt: new Date(),
    };
    this.stockLedgerEntries.push(entry);
  }

  private getOnHand(variantId: string): number {
    return this.stockLedgerEntries
      .filter((entry) => entry.variantId === variantId)
      .reduce((total, entry) => total + entry.quantityChange, 0);
  }
}

describe('sales routes', () => {
  const VARIANT_ID = '123e4567-e89b-12d3-a456-426614174000';
  let prisma: FakePrismaClient;
  let server: ReturnType<typeof buildServer>;
  let token: string;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret-jwt-value-should-be-long-123456';
    process.env.DATABASE_URL = 'postgres://localhost/test';
    prisma = new FakePrismaClient();
    const now = new Date();
    prisma.seedVariant({
      id: VARIANT_ID,
      productId: 'product-1',
      brandId: 'brand-1',
      sku: 'SKU-123',
      size: null,
      color: null,
      priceCents: 1000,
      costPriceCents: null,
      barcode: 'ABC123',
      createdAt: now,
      updatedAt: now,
      productName: 'Comfy Sneaker',
      brandName: 'ShoeBrand',
    });
    prisma.recordStock(VARIANT_ID, 10, StockLedgerType.INITIAL_COUNT);
    server = buildServer({ prismaClient: prisma as unknown as PrismaClient, logger: false });
    await server.ready();
    token = server.jwt.sign({ sub: 'employee-1', role: Role.MANAGER });
  });

  afterEach(async () => {
    await server.close();
  });

  it('creates a sale, stores payment info, and writes stock ledger entries', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            variantId: VARIANT_ID,
            quantity: 2,
            discountCents: 100,
          },
        ],
        saleDiscountCents: 50,
        taxCents: 80,
        payments: [
          { method: 'CASH', amountCents: 1930 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      totalCents: number;
      discountTotalCents: number;
      payments: Array<{ method: string; amountCents: number }>;
    };

    expect(body.totalCents).toBe(1930);
    expect(body.discountTotalCents).toBe(150);
    expect(body.payments).toEqual([{ method: 'CASH', amountCents: 1930 }]);

    expect(prisma.sales.size).toBe(1);
    expect(prisma.saleItems.size).toBe(1);
    expect(prisma.stockLedgerEntries).toHaveLength(2); // initial count + sale
    const saleLedger = prisma.stockLedgerEntries[1];
    expect(saleLedger.type).toBe(StockLedgerType.SALE);
    expect(saleLedger.quantityChange).toBe(-2);
  });

  it('rolls back sale creation when stock ledger fails', async () => {
    prisma.throwOnLedgerCreate = true;

    const response = await server.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            variantId: VARIANT_ID,
            quantity: 1,
          },
        ],
        saleDiscountCents: 0,
        taxCents: 0,
        payments: [{ method: 'CARD', amountCents: 1000 }],
      },
    });

    expect(response.statusCode).toBe(500);
    expect(prisma.sales.size).toBe(0);
    expect(prisma.saleItems.size).toBe(0);
    expect(prisma.stockLedgerEntries).toHaveLength(1); // only initial count remains
  });

  it('returns a receipt payload with store info and totals', async () => {
    const saleResponse = await server.inject({
      method: 'POST',
      url: '/api/sales',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        items: [
          {
            variantId: VARIANT_ID,
            quantity: 1,
          },
        ],
        saleDiscountCents: 0,
        taxCents: 0,
        payments: [{ method: 'CARD', amountCents: 1000 }],
      },
    });

    expect(saleResponse.statusCode).toBe(201);
    const saleBody = saleResponse.json() as { id: string };

    const receiptResponse = await server.inject({
      method: 'GET',
      url: `/api/sales/${saleBody.id}/receipt`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(receiptResponse.statusCode).toBe(200);
    const receipt = receiptResponse.json() as {
      sale: { totalCents: number; saleDiscountCents: number };
      store: { name: string };
      items: Array<{ productName: string; sku: string }>;
      totals: { paymentTotalCents: number; totalCents: number };
    };

    expect(receipt.store.name).toBe('POS Shoestore');
    expect(receipt.sale.saleDiscountCents).toBe(0);
    expect(receipt.items[0].productName).toBe('Comfy Sneaker');
    expect(receipt.items[0].sku).toBe('SKU-123');
    expect(receipt.totals.paymentTotalCents).toBe(receipt.totals.totalCents);
  });

  it('looks up variants by id and barcode for quick scanning', async () => {
    const byId = await server.inject({
      method: 'GET',
      url: `/api/variants/${VARIANT_ID}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(byId.statusCode).toBe(200);
    const variantById = byId.json() as { onHand: number; sku: string };
    expect(variantById.sku).toBe('SKU-123');
    expect(variantById.onHand).toBe(10);

    const byBarcode = await server.inject({
      method: 'GET',
      url: '/api/scan/ABC123',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(byBarcode.statusCode).toBe(200);
    const variantByBarcode = byBarcode.json() as { variantId: string };
    expect(variantByBarcode.variantId).toBe(VARIANT_ID);
  });
});
