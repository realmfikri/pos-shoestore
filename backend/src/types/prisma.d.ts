declare module '@prisma/client' {
  export const Role: {
    readonly OWNER: 'OWNER';
    readonly MANAGER: 'MANAGER';
    readonly EMPLOYEE: 'EMPLOYEE';
  };

  export type Role = (typeof Role)[keyof typeof Role];

  export const StockLedgerType: {
    readonly INITIAL_COUNT: 'INITIAL_COUNT';
    readonly ADJUSTMENT: 'ADJUSTMENT';
    readonly RECEIPT: 'RECEIPT';
    readonly SALE: 'SALE';
  };

  export type StockLedgerType = (typeof StockLedgerType)[keyof typeof StockLedgerType];

  export const PurchaseOrderStatus: {
    readonly DRAFT: 'DRAFT';
    readonly PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED';
    readonly RECEIVED: 'RECEIVED';
    readonly CANCELLED: 'CANCELLED';
  };

  export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

  export type User = {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: Role;
    createdAt: Date;
    updatedAt: Date;
  };

  export type Brand = {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type Product = {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    tags: string[];
    brandId: string;
    createdAt: Date;
    updatedAt: Date;
  };

  export type Variant = {
    id: string;
    productId: string;
    sku: string;
    size: string | null;
    color: string | null;
    priceCents: number | null;
    costPriceCents: number | null;
    barcode: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type StockLedger = {
    id: string;
    variantId: string;
    recordedById: string | null;
    quantityChange: number;
    type: StockLedgerType;
    reason: string | null;
    reference: string | null;
    createdAt: Date;
  };

  export type Supplier = {
    id: string;
    name: string;
    contact: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type PurchaseOrder = {
    id: string;
    supplierId: string;
    createdById: string;
    status: PurchaseOrderStatus;
    orderedAt: Date | null;
    receivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type PurchaseOrderItem = {
    id: string;
    purchaseOrderId: string;
    variantId: string;
    quantityOrdered: number;
    quantityReceived: number;
    costCents: number | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type GoodsReceipt = {
    id: string;
    purchaseOrderId: string;
    receivedById: string | null;
    receivedAt: Date;
    createdAt: Date;
  };

  export type GoodsReceiptItem = {
    id: string;
    goodsReceiptId: string;
    purchaseOrderItemId: string;
    quantityReceived: number;
    costCents: number | null;
    createdAt: Date;
  };

  export type CurrentStock = {
    variantId: string;
    productId: string;
    brandId: string;
    onHand: number;
    sku: string;
    brandName: string;
    productName: string;
    category: string | null;
    size: string | null;
    color: string | null;
    tags: string[];
    priceCents: number | null;
  };

  export interface PrismaClientOptions {
    log?: Array<'query' | 'info' | 'warn' | 'error'>;
  }

  export class PrismaClient {
    constructor(options?: PrismaClientOptions);

    user: {
      findUnique(args: { where: { email?: string; id?: string } }): Promise<User | null>;
      upsert(args: {
        where: { email: string };
        update: Partial<User>;
        create: Partial<User> & {
          email: string;
          passwordHash: string;
          firstName: string;
          lastName: string;
          role: Role;
        };
      }): Promise<User>;
    };

    supplier: {
      create(args: { data: Partial<Supplier> & { name: string } }): Promise<Supplier>;
      findMany(): Promise<Supplier[]>;
      findUnique(args: { where: { id: string } }): Promise<Supplier | null>;
      update(args: { where: { id: string }; data: Partial<Supplier> }): Promise<Supplier>;
      delete(args: { where: { id: string } }): Promise<Supplier>;
    };

    purchaseOrder: {
      create(args: { data: Partial<PurchaseOrder> & { supplierId: string; createdById: string } }): Promise<PurchaseOrder>;
      findMany(): Promise<PurchaseOrder[]>;
      findUnique(args: { where: { id: string } }): Promise<PurchaseOrder | null>;
      update(args: { where: { id: string }; data: Partial<PurchaseOrder> }): Promise<PurchaseOrder>;
    };

    purchaseOrderItem: {
      create(args: { data: Partial<PurchaseOrderItem> & { purchaseOrderId: string; variantId: string; quantityOrdered: number } }): Promise<PurchaseOrderItem>;
      createMany(args: { data: Array<Partial<PurchaseOrderItem> & { purchaseOrderId: string; variantId: string; quantityOrdered: number }> }): Promise<{ count: number }>;
      findMany(args: { where: { purchaseOrderId?: string; id?: string; variantId?: string } }): Promise<PurchaseOrderItem[]>;
      update(args: { where: { id: string }; data: Partial<PurchaseOrderItem> }): Promise<PurchaseOrderItem>;
    };

    goodsReceipt: {
      create(args: { data: Partial<GoodsReceipt> & { purchaseOrderId: string } }): Promise<GoodsReceipt>;
      findMany(args: { where: { purchaseOrderId?: string } }): Promise<GoodsReceipt[]>;
    };

    goodsReceiptItem: {
      create(args: { data: Partial<GoodsReceiptItem> & { goodsReceiptId: string; purchaseOrderItemId: string; quantityReceived: number } }): Promise<GoodsReceiptItem>;
      findMany(args: { where: { goodsReceiptId?: string; purchaseOrderItemId?: string } }): Promise<GoodsReceiptItem[]>;
    };

    variant: {
      findUnique(args: { where: { id?: string; sku?: string } }): Promise<Variant | null>;
      update(args: { where: { id: string }; data: Partial<Variant> }): Promise<Variant>;
    };

    stockLedger: {
      create(args: { data: Partial<StockLedger> & { variantId: string; quantityChange: number; type: StockLedgerType } }): Promise<StockLedger>;
      findMany(args?: { where?: { variantId?: string } }): Promise<StockLedger[]>;
    };

    $queryRaw<T = unknown>(
      query: TemplateStringsArray | { raw: string } | Prisma.Sql,
      ...values: unknown[]
    ): Promise<T>;
    $executeRaw(
      query: TemplateStringsArray | { raw: string } | Prisma.Sql,
      ...values: unknown[]
    ): Promise<unknown>;

    $transaction<T>(transaction: (client: PrismaClient) => Promise<T>): Promise<T>;

    $disconnect(): Promise<void>;
  }

  export namespace Prisma {
    interface Sql {
      readonly values: unknown[];
      readonly strings: TemplateStringsArray;
    }

    function sql(strings: TemplateStringsArray, ...values: unknown[]): Sql;
    function join(values: Sql[], separator: Sql): Sql;

    class PrismaClientKnownRequestError extends Error {
      code: string;
    }
  }
}
