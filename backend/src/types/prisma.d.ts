declare module '@prisma/client' {
  type JsonPrimitive = string | number | boolean | null;
  type JsonStructure = JsonPrimitive | JsonStructure[] | { [key: string]: JsonStructure };

  export type JsonValue = JsonStructure;
  export type InputJsonValue = JsonStructure;
  export type JsonNull = null;

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

  export const InventoryImportStatus: {
    readonly PENDING: 'PENDING';
    readonly PROCESSING: 'PROCESSING';
    readonly COMPLETED: 'COMPLETED';
    readonly FAILED: 'FAILED';
  };
  export type InventoryImportStatus = (typeof InventoryImportStatus)[keyof typeof InventoryImportStatus];

  export const MediaStatus: {
    readonly PENDING_UPLOAD: 'PENDING_UPLOAD';
    readonly READY: 'READY';
    readonly PROCESSING: 'PROCESSING';
    readonly OPTIMIZED: 'OPTIMIZED';
    readonly FAILED: 'FAILED';
  };
  export type MediaStatus = (typeof MediaStatus)[keyof typeof MediaStatus];

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

  export type RefreshToken = {
    id: string;
    token: string;
    userId: string;
    expiresAt: Date;
    createdAt: Date;
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
    brand?: Brand;
    media?: Media[];
    variants?: Variant[];
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
    product?: Product | null;
    media?: Media[];
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
    recordedBy?: User | null;
  };

  export type InventoryImportBatch = {
    id: string;
    status: InventoryImportStatus;
    uploadedById: string;
    originalFileName: string;
    totalRows: number;
    processedRows: number;
    chunkSize: number;
    failureReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type InventoryImportAuditLog = {
    id: string;
    batchId: string;
    level: string;
    message: string;
    metadata: JsonValue | null;
    createdAt: Date;
  };

  export type Sale = {
    id: string;
    recordedById: string | null;
    subtotalCents: number;
    saleDiscountCents: number;
    discountTotalCents: number;
    taxTotalCents: number;
    totalCents: number;
    paymentBreakdown: JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type SaleItem = {
    id: string;
    saleId: string;
    variantId: string;
    quantity: number;
    unitPriceCents: number;
    discountCents: number;
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
    items?: GoodsReceiptItem[];
  };

  export type GoodsReceiptItem = {
    id: string;
    goodsReceiptId: string;
    purchaseOrderItemId: string;
    quantityReceived: number;
    costCents: number | null;
    createdAt: Date;
  };

  export type Media = {
    id: string;
    productId: string | null;
    variantId: string | null;
    bucket: string;
    key: string;
    fileName: string;
    contentType: string;
    sizeBytes: number | null;
    status: MediaStatus;
    optimizedKey: string | null;
    uploadExpiresAt: Date | null;
    uploadedAt: Date | null;
    optimizedAt: Date | null;
    originalDeletedAt: Date | null;
    failureReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  };

  export type Setting = {
    key: string;
    value: string;
    createdAt: Date;
    updatedAt: Date;
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

  export type DailySalesTotals = {
    saleDate: Date;
    grossSalesCents: number;
    discountTotalCents: number;
    taxTotalCents: number;
    netSalesCents: number;
    saleCount: number;
  };

  export type SaleItemDailyMetrics = {
    saleDate: Date;
    variantId: string;
    productId: string;
    brandId: string;
    sku: string;
    productName: string;
    brandName: string;
    quantitySold: number;
    grossSalesCents: number;
    discountTotalCents: number;
    netSalesCents: number;
    lastSoldAt: Date;
  };

  export type BrandDailyMetrics = {
    saleDate: Date;
    brandId: string;
    brandName: string;
    quantitySold: number;
    grossSalesCents: number;
    discountTotalCents: number;
    netSalesCents: number;
  };

  export type LowStockVariants = {
    variantId: string;
    productId: string;
    brandId: string;
    sku: string;
    productName: string;
    brandName: string;
    onHand: number;
    threshold: number;
  };

  export interface PrismaClientOptions {
    log?: Array<'query' | 'info' | 'warn' | 'error'>;
  }

  type DelegatePromise<T> = Promise<T>;
  interface PrismaDelegate<T> {
    findUnique(args: any): DelegatePromise<T | null>;
    findFirst?(args: any): DelegatePromise<T | null>;
    findMany(args?: any): DelegatePromise<T[]>;
    create(args: any): DelegatePromise<T>;
    createMany?(args: any): DelegatePromise<{ count: number }>;
    update(args: any): DelegatePromise<T>;
    updateMany?(args: any): DelegatePromise<{ count: number }>;
    delete(args: any): DelegatePromise<T>;
    deleteMany?(args: any): DelegatePromise<{ count: number }>;
    upsert?(args: any): DelegatePromise<T>;
    aggregate?(args: any): DelegatePromise<any>;
    count?(args: any): DelegatePromise<number>;
  }

  export class PrismaClient {
    constructor(options?: PrismaClientOptions);

    user: PrismaDelegate<User>;
    refreshToken: PrismaDelegate<RefreshToken>;
    brand: PrismaDelegate<Brand>;
    product: PrismaDelegate<Product>;
    variant: PrismaDelegate<Variant>;
    stockLedger: PrismaDelegate<StockLedger>;
    inventoryImportBatch: PrismaDelegate<InventoryImportBatch>;
    inventoryImportAuditLog: PrismaDelegate<InventoryImportAuditLog>;
    sale: PrismaDelegate<Sale>;
    saleItem: PrismaDelegate<SaleItem>;
    supplier: PrismaDelegate<Supplier>;
    purchaseOrder: PrismaDelegate<PurchaseOrder>;
    purchaseOrderItem: PrismaDelegate<PurchaseOrderItem>;
    goodsReceipt: PrismaDelegate<GoodsReceipt>;
    goodsReceiptItem: PrismaDelegate<GoodsReceiptItem>;
    media: PrismaDelegate<Media>;
    setting: PrismaDelegate<Setting>;

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
    type Sql = {
      readonly strings: TemplateStringsArray;
      readonly values: unknown[];
    };

    function sql(strings: TemplateStringsArray, ...values: unknown[]): Sql;
    function join(values: Sql[], separator?: Sql): Sql;

    type StockLedgerWhereInput = {
      id?: string;
      variantId?: string;
      recordedById?: string | null;
      AND?: StockLedgerWhereInput | StockLedgerWhereInput[];
      OR?: StockLedgerWhereInput[];
      NOT?: StockLedgerWhereInput | StockLedgerWhereInput[];
      [key: string]: unknown;
    };

    export type JsonValue = JsonStructure;
    export type InputJsonValue = JsonStructure;
    export type JsonNull = null;

    export type VariantUpdateInput = Partial<Variant>;

    export type TransactionClient = PrismaClient;

    const QueryMode: {
      readonly default: 'default';
      readonly insensitive: 'insensitive';
    };
    export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode];

    class PrismaClientKnownRequestError extends Error {
      code: string;
    }
  }

  export const Prisma: {
    sql: typeof Prisma.sql;
    join: typeof Prisma.join;
    PrismaClientKnownRequestError: typeof Prisma.PrismaClientKnownRequestError;
    QueryMode: typeof Prisma.QueryMode;
  };
}
