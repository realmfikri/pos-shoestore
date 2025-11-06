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

    $queryRaw<T = unknown>(
      query: TemplateStringsArray | { raw: string } | Prisma.Sql,
      ...values: unknown[]
    ): Promise<T>;
    $executeRaw(
      query: TemplateStringsArray | { raw: string } | Prisma.Sql,
      ...values: unknown[]
    ): Promise<unknown>;

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
