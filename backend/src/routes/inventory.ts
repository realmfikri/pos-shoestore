import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { Prisma, Role } from '@prisma/client';
import { requireRoles, AuthenticatedRequest } from '../middleware/authGuard';
import {
  CreateBrandBodySchema,
  CreateProductBodySchema,
  CreateVariantBodySchema,
  CreateInitialStockBodySchema,
  InventoryQuerySchema,
  InventoryItemSchema,
} from '../types/inventoryContracts';

const STOCK_WRITE_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.EMPLOYEE];

type InventoryRow = {
  variant_id: string;
  product_id: string;
  brand_id: string;
  on_hand: number;
  sku: string;
  brand_name: string;
  product_name: string;
  category: string | null;
  size: string | null;
  color: string | null;
  tags: string[];
  price_cents: number | null;
  description: string | null;
  total_count: bigint | number | null;
};

const handleUnknownError = (fastify: FastifyInstance, error: unknown, message: string) => {
  fastify.log.error({ err: error }, message);
  throw error;
};

const registerInventoryRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post(
    '/api/brands',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const body = CreateBrandBodySchema.parse(request.body);
      const id = randomUUID();
      const timestamp = new Date();

      try {
        const [brand] = await fastify.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            description: string | null;
            createdAt: Date;
            updatedAt: Date;
          }>
        >(
          Prisma.sql`
            INSERT INTO "Brand" ("id", "name", "description", "updatedAt")
            VALUES (${id}, ${body.name}, ${body.description ?? null}, ${timestamp})
            RETURNING "id", "name", "description", "createdAt", "updatedAt"
          `,
        );

        reply.code(201).send(brand);
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          reply.code(409).send({ message: 'Brand name already exists' });
          return;
        }

        handleUnknownError(fastify, error, 'Failed to create brand');
      }
    },
  );

  fastify.post(
    '/api/products',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const body = CreateProductBodySchema.parse(request.body);
      const id = randomUUID();
      const timestamp = new Date();

      const brandExists = await fastify.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Brand" WHERE "id" = ${body.brandId} LIMIT 1`,
      );

      if (brandExists.length === 0) {
        reply.code(404).send({ message: 'Brand not found' });
        return;
      }

      try {
        const [product] = await fastify.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            description: string | null;
            category: string | null;
            tags: string[];
            brandId: string;
            createdAt: Date;
            updatedAt: Date;
          }>
        >(
          Prisma.sql`
            INSERT INTO "Product" ("id", "name", "description", "category", "tags", "brandId", "updatedAt")
            VALUES (${id}, ${body.name}, ${body.description ?? null}, ${body.category ?? null}, ${body.tags}, ${body.brandId}, ${timestamp})
            RETURNING "id", "name", "description", "category", "tags", "brandId", "createdAt", "updatedAt"
          `,
        );

        reply.code(201).send(product);
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          reply.code(409).send({ message: 'Product already exists for this brand' });
          return;
        }

        handleUnknownError(fastify, error, 'Failed to create product');
      }
    },
  );

  fastify.post(
    '/api/variants',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const body = CreateVariantBodySchema.parse(request.body);
      const id = randomUUID();
      const timestamp = new Date();

      const productExists = await fastify.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${body.productId} LIMIT 1`,
      );

      if (productExists.length === 0) {
        reply.code(404).send({ message: 'Product not found' });
        return;
      }

      try {
        const [variant] = await fastify.prisma.$queryRaw<
          Array<{
            id: string;
            productId: string;
            sku: string;
            size: string | null;
            color: string | null;
            priceCents: number | null;
            barcode: string | null;
            createdAt: Date;
            updatedAt: Date;
          }>
        >(
          Prisma.sql`
            INSERT INTO "Variant" ("id", "productId", "sku", "size", "color", "priceCents", "barcode", "updatedAt")
            VALUES (${id}, ${body.productId}, ${body.sku}, ${body.size ?? null}, ${body.color ?? null}, ${body.priceCents ?? null}, ${body.barcode ?? null}, ${timestamp})
            RETURNING "id", "productId", "sku", "size", "color", "priceCents", "barcode", "createdAt", "updatedAt"
          `,
        );

        reply.code(201).send(variant);
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          reply.code(409).send({ message: 'Variant with this SKU already exists' });
          return;
        }

        handleUnknownError(fastify, error, 'Failed to create variant');
      }
    },
  );

  fastify.post(
    '/api/stock/initial',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const body = CreateInitialStockBodySchema.parse(request.body);
      const user = (request as AuthenticatedRequest).user;
      const id = randomUUID();
      const timestamp = new Date();

      const variantExists = await fastify.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Variant" WHERE "id" = ${body.variantId} LIMIT 1`,
      );

      if (variantExists.length === 0) {
        reply.code(404).send({ message: 'Variant not found' });
        return;
      }

      const existingInitial = await fastify.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id" FROM "StockLedger"
          WHERE "variantId" = ${body.variantId} AND "type" = 'INITIAL_COUNT'
          LIMIT 1
        `,
      );

      if (existingInitial.length > 0) {
        reply.code(409).send({ message: 'Initial stock already recorded for this variant' });
        return;
      }

      if (!Number.isInteger(body.quantity) || body.quantity < 0) {
        reply.code(400).send({ message: 'quantity must be a non-negative integer' });
        return;
      }

      try {
        const [ledgerEntry] = await fastify.prisma.$queryRaw<
          Array<{
            id: string;
            variantId: string;
            recordedById: string | null;
            quantityChange: number;
            type: string;
            reason: string | null;
            reference: string | null;
            createdAt: Date;
          }>
        >(
          Prisma.sql`
            INSERT INTO "StockLedger" ("id", "variantId", "recordedById", "quantityChange", "type", "reason", "reference", "createdAt")
            VALUES (${id}, ${body.variantId}, ${user.sub}, ${body.quantity}, 'INITIAL_COUNT', ${body.reason ?? null}, ${body.reference ?? null}, ${timestamp})
            RETURNING "id", "variantId", "recordedById", "quantityChange", "type", "reason", "reference", "createdAt"
          `,
        );

        reply.code(201).send(ledgerEntry);
      } catch (error: unknown) {
        handleUnknownError(fastify, error, 'Failed to record initial stock');
      }
    },
  );

  fastify.get(
    '/api/inventory',
    { preHandler: requireRoles([Role.OWNER, Role.MANAGER, Role.EMPLOYEE]) },
    async (request) => {
      const parsedQuery = InventoryQuerySchema.parse(request.query);
      const page = parsedQuery.page;
      const pageSize = parsedQuery.pageSize;
      const offset = (page - 1) * pageSize;
      const tags = parsedQuery.tag
        ? Array.isArray(parsedQuery.tag)
          ? parsedQuery.tag
          : [parsedQuery.tag]
        : undefined;

      const filters: Prisma.Sql[] = [];

      if (parsedQuery.brandId) {
        filters.push(Prisma.sql`cs.brand_id = ${parsedQuery.brandId}`);
      }

      if (parsedQuery.brand) {
        filters.push(Prisma.sql`lower(cs.brand_name) = lower(${parsedQuery.brand})`);
      }

      if (parsedQuery.category) {
        filters.push(Prisma.sql`cs.category ILIKE ${`%${parsedQuery.category}%`}`);
      }

      if (parsedQuery.size) {
        filters.push(Prisma.sql`cs.size ILIKE ${`%${parsedQuery.size}%`}`);
      }

      if (parsedQuery.color) {
        filters.push(Prisma.sql`cs.color ILIKE ${`%${parsedQuery.color}%`}`);
      }

      if (tags && tags.length > 0) {
        const tagArray = Prisma.sql`ARRAY[${Prisma.join(
          tags.map((tag) => Prisma.sql`${tag}`),
          Prisma.sql`, `,
        )}]::text[]`;
        filters.push(Prisma.sql`cs.tags && ${tagArray}`);
      }

      if (parsedQuery.search) {
        const searchTerm = parsedQuery.search;
        filters.push(
          Prisma.sql`
          (
            b."searchVector" @@ plainto_tsquery('simple', ${searchTerm})
            OR p."searchVector" @@ plainto_tsquery('simple', ${searchTerm})
            OR similarity(lower(cs.sku), lower(${searchTerm})) > 0.25
            OR similarity(lower(b."name"), lower(${searchTerm})) > 0.25
            OR similarity(lower(p."name"), lower(${searchTerm})) > 0.25
          )
        `,
        );
      }

      const whereClause =
        filters.length > 0
          ? Prisma.sql`WHERE ${Prisma.join(filters, Prisma.sql` AND `)}`
          : Prisma.sql``;

      const rows = await fastify.prisma.$queryRaw<InventoryRow[]>(
        Prisma.sql`
        SELECT
          cs.variant_id,
          cs.product_id,
          cs.brand_id,
          cs.on_hand,
          cs.sku,
          cs.brand_name,
          cs.product_name,
          cs.category,
          cs.size,
          cs.color,
          cs.tags,
          cs.price_cents,
          p."description",
          COUNT(*) OVER() AS total_count
        FROM "current_stock" cs
        INNER JOIN "Product" p ON p."id" = cs.product_id
        INNER JOIN "Brand" b ON b."id" = cs.brand_id
        ${whereClause}
        ORDER BY cs.brand_name, cs.product_name, cs.sku
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      );

      const total = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
      const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize);

      const data = rows.map((row) => ({
        variantId: row.variant_id,
        productId: row.product_id,
        brandId: row.brand_id,
        sku: row.sku,
        brandName: row.brand_name,
        productName: row.product_name,
        category: row.category,
        size: row.size,
        color: row.color,
        tags: row.tags ?? [],
        priceCents: row.price_cents ?? null,
        onHand: Number(row.on_hand ?? 0),
        description: row.description,
      }));

      InventoryItemSchema.array().parse(data);

      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          pageCount,
        },
      };
    },
  );
};

export default registerInventoryRoutes;
