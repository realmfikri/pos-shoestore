import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { InventoryImportStatus, Prisma, Role, StockLedgerType, Media } from '@prisma/client';
import { z } from 'zod';
import { requireRoles, AuthenticatedRequest } from '../middleware/authGuard';
import {
  CreateBrandBodySchema,
  CreateProductBodySchema,
  CreateVariantBodySchema,
  CreateInitialStockBodySchema,
  InventoryQuerySchema,
  InventoryItemSchema,
  InventoryQuery,
  InventoryDetailParamsSchema,
  StockLedgerQuerySchema,
  CreateStockAdjustmentBodySchema,
  StockLedgerTypeValues,
} from '../types/inventoryContracts';
import {
  InventoryImportApplyResponseSchema,
  InventoryImportPreviewResponseSchema,
} from '../types/inventoryImportContracts';
import {
  BarcodeLookupParamsSchema,
  VariantLookupParamsSchema,
  VariantLookupResponseSchema,
} from '../types/salesContracts';
import {
  parseInventoryImportCsv,
  loadInventoryImportContext,
  analyseInventoryImport,
  processInventoryImport,
  failInventoryImportBatch,
  completeInventoryImportBatch,
} from '../services/inventoryImport';
import { MediaStatus } from '../types/mediaStatus';
import { env } from '../config/env';

const STOCK_WRITE_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.EMPLOYEE];

const MEDIA_VIEWABLE_STATUSES = new Set([MediaStatus.READY, MediaStatus.OPTIMIZED]);

const BrandListQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),
    limit: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional(),
  })
  .strict();

const buildInventoryFilters = (parsedQuery: InventoryQuery): Prisma.Sql[] => {
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

  const tagParam = parsedQuery.tag
    ? Array.isArray(parsedQuery.tag)
      ? parsedQuery.tag
      : [parsedQuery.tag]
    : undefined;

  if (tagParam && tagParam.length > 0) {
    const tagArray = Prisma.sql`ARRAY[${Prisma.join(
      tagParam.map((tag) => Prisma.sql`${tag}`),
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

  return filters;
};

const buildWhereClause = (filters: Prisma.Sql[]) =>
  filters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(filters, Prisma.sql` AND `)}` : Prisma.sql``;

const createMediaPreview = async (fastify: FastifyInstance, media: Media) => {
  if (!MEDIA_VIEWABLE_STATUSES.has(media.status)) {
    return null;
  }

  const objectKey = media.optimizedKey ?? media.key;

  try {
    const url = await fastify.minio.presignedGetObject(
      media.bucket,
      objectKey,
      env.MEDIA_SIGNED_URL_EXPIRY_SECONDS,
    );

    return {
      id: media.id,
      fileName: media.fileName,
      url,
      variantId: media.variantId,
      productId: media.productId,
      createdAt: media.createdAt.toISOString(),
    };
  } catch (error) {
    fastify.log.warn({ err: error, mediaId: media.id }, 'Failed to generate media preview URL');
    return {
      id: media.id,
      fileName: media.fileName,
      url: null,
      variantId: media.variantId,
      productId: media.productId,
      createdAt: media.createdAt.toISOString(),
    };
  }
};

const loadOnHandForVariants = async (fastify: FastifyInstance, variantIds: string[]) => {
  if (variantIds.length === 0) {
    return new Map<string, number>();
  }

  const rows = await fastify.prisma.$queryRaw<
    Array<{ variant_id: string; on_hand: bigint | number | null }>
  >(
    Prisma.sql`
      SELECT variant_id, on_hand
      FROM "current_stock"
      WHERE variant_id IN (${Prisma.join(variantIds.map((id) => Prisma.sql`${id}`))})
    `,
  );

  return new Map(rows.map((row) => [row.variant_id, Number(row.on_hand ?? 0)]));
};

const fetchCurrentOnHand = async (fastify: FastifyInstance, variantId: string) => {
  const rows = await fastify.prisma.$queryRaw<
    Array<{ on_hand: bigint | number | null }>
  >(
    Prisma.sql`
      SELECT on_hand
      FROM "current_stock"
      WHERE variant_id = ${variantId}
      LIMIT 1
    `,
  );

  if (rows.length === 0) {
    return 0;
  }

  return Number(rows[0].on_hand ?? 0);
};

const csvEscape = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

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

type InventoryExportRow = {
  brand_name: string | null;
  product_name: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  price_cents: number | null;
  on_hand: bigint | number | null;
  tags: string[] | null;
  barcode: string | null;
};

const handleUnknownError = (fastify: FastifyInstance, error: unknown, message: string) => {
  fastify.log.error({ err: error }, message);
  throw error;
};

const registerInventoryRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get(
    '/api/brands',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const query = BrandListQuerySchema.parse(request.query ?? {});
      const where = query.search
        ? {
            name: {
              contains: query.search,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : undefined;

      const brands = await fastify.prisma.brand.findMany({
        where,
        orderBy: { name: 'asc' },
        take: query.limit ?? 20,
      });

      reply.send(
        brands.map((brand) => ({
          id: brand.id,
          name: brand.name,
          description: brand.description,
          createdAt: brand.createdAt.toISOString(),
          updatedAt: brand.updatedAt.toISOString(),
        })),
      );
    },
  );

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

  fastify.post(
    '/api/inventory/import/preview',
    { preHandler: requireRoles([Role.OWNER]) },
    async (request, reply) => {
      const file = await request.file();

      if (!file) {
        reply.code(400).send({ message: 'CSV file upload is required' });
        return;
      }

      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to read uploaded CSV');
        reply.code(400).send({ message: 'Unable to read uploaded CSV file' });
        return;
      }

      if (buffer.length === 0) {
        reply.code(400).send({ message: 'Uploaded CSV file is empty' });
        return;
      }

      let rows;
      try {
        rows = parseInventoryImportCsv(buffer);
      } catch (error) {
        fastify.log.warn({ err: error }, 'Failed to parse inventory import CSV');
        reply.code(400).send({ message: 'CSV contents could not be parsed' });
        return;
      }

      if (rows.length === 0) {
        const emptyResponse = InventoryImportPreviewResponseSchema.parse({
          rows: [],
          summary: {
            totalRows: 0,
            create: { brands: 0, products: 0, variants: 0 },
            update: { variants: 0, priceChanges: 0, stockAdjustments: 0 },
            duplicates: [],
            blockingIssueCount: 0,
          },
        });
        reply.send(emptyResponse);
        return;
      }

      const context = await loadInventoryImportContext(fastify.prisma, rows);
      const analysis = analyseInventoryImport(rows, context);

      const previewRows = analysis.rows.map((row) => {
        const { brandPlan, productPlan, variantPlan, ...rest } = row;
        void brandPlan;
        void productPlan;
        void variantPlan;
        return rest;
      });

      const response = InventoryImportPreviewResponseSchema.parse({
        rows: previewRows,
        summary: analysis.summary,
      });

      reply.send(response);
    },
  );

  fastify.post(
    '/api/inventory/import/apply',
    { preHandler: requireRoles([Role.OWNER]) },
    async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      const file = await request.file();

      if (!file) {
        reply.code(400).send({ message: 'CSV file upload is required' });
        return;
      }

      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to read uploaded CSV');
        reply.code(400).send({ message: 'Unable to read uploaded CSV file' });
        return;
      }

      if (buffer.length === 0) {
        reply.code(400).send({ message: 'Uploaded CSV file is empty' });
        return;
      }

      let rows;
      try {
        rows = parseInventoryImportCsv(buffer);
      } catch (error) {
        fastify.log.warn({ err: error }, 'Failed to parse inventory import CSV');
        reply.code(400).send({ message: 'CSV contents could not be parsed' });
        return;
      }

      if (rows.length === 0) {
        reply.code(400).send({ message: 'CSV does not contain any rows' });
        return;
      }

      const context = await loadInventoryImportContext(fastify.prisma, rows);
      const analysis = analyseInventoryImport(rows, context);

      const previewRows = analysis.rows.map((row) => {
        const { brandPlan, productPlan, variantPlan, ...rest } = row;
        void brandPlan;
        void productPlan;
        void variantPlan;
        return rest;
      });

      if (analysis.summary.blockingIssueCount > 0) {
        const preview = InventoryImportPreviewResponseSchema.parse({
          rows: previewRows,
          summary: analysis.summary,
        });
        reply.code(400).send({
          message: 'Import contains blocking issues. Resolve them before applying.',
          preview,
        });
        return;
      }

      const shouldQueue = rows.length > 1000;
      const chunkSize = rows.length > 2000 ? 500 : shouldQueue ? 250 : 200;

      const batch = await fastify.prisma.inventoryImportBatch.create({
        data: {
          id: randomUUID(),
          status: shouldQueue ? InventoryImportStatus.PENDING : InventoryImportStatus.PROCESSING,
          uploadedById: user.sub,
          originalFileName: file.filename ?? 'inventory-import.csv',
          totalRows: rows.length,
          chunkSize,
        },
      });

      const runImport = async () => {
        try {
          await fastify.prisma.inventoryImportBatch.update({
            where: { id: batch.id },
            data: { status: InventoryImportStatus.PROCESSING },
          });

          await processInventoryImport({
            fastify,
            batchId: batch.id,
            userId: user.sub,
            chunkSize,
            rows: analysis.rows,
            brandPlans: analysis.brandPlans,
            productPlans: analysis.productPlans,
            variantPlans: analysis.variantPlans,
            variantStocks: context.variantStocks,
          });

          await completeInventoryImportBatch(fastify.prisma, batch.id);
        } catch (error) {
          fastify.log.error({ err: error, batchId: batch.id }, 'Inventory import failed');
          const reason = error instanceof Error ? error.message : 'Unexpected import failure';
          await failInventoryImportBatch(fastify.prisma, batch.id, reason);
          throw error;
        }
      };

      if (shouldQueue) {
        setImmediate(() => {
          runImport().catch(() => {
            // errors are logged and recorded in the batch
          });
        });

        const response = InventoryImportApplyResponseSchema.parse({
          batchId: batch.id,
          status: 'QUEUED',
          summary: analysis.summary,
        });

        reply.code(202).send(response);
        return;
      }

      try {
        await runImport();
      } catch (error) {
        fastify.log.error({ err: error, batchId: batch.id }, 'Failed to apply inventory import');
        reply.code(500).send({ message: 'Failed to apply inventory import' });
        return;
      }

      const response = InventoryImportApplyResponseSchema.parse({
        batchId: batch.id,
        status: 'COMPLETED',
        summary: analysis.summary,
      });

      reply.send(response);
    },
  );

  fastify.get(
    '/api/inventory/export',
    { preHandler: requireRoles([Role.OWNER]) },
    async (request, reply) => {
      const parsedQuery = InventoryQuerySchema.parse(request.query);
      const filters = buildInventoryFilters(parsedQuery);
      const whereClause = buildWhereClause(filters);

      const rows = await fastify.prisma.$queryRaw<InventoryExportRow[]>(
        Prisma.sql`
          SELECT
            cs.brand_name,
            cs.product_name,
            cs.sku,
            cs.size,
            cs.color,
            cs.price_cents,
            cs.on_hand,
            cs.tags,
            v."barcode"
          FROM "current_stock" cs
          INNER JOIN "Variant" v ON v."id" = cs.variant_id
          INNER JOIN "Product" p ON p."id" = cs.product_id
          INNER JOIN "Brand" b ON b."id" = cs.brand_id
          ${whereClause}
          ORDER BY cs.brand_name, cs.product_name, cs.sku
        `,
      );

      const headers = [
        'Brand',
        'Product',
        'SKU',
        'Size',
        'Color',
        'Price',
        'OnHand',
        'Tags',
        'Barcode',
      ];
      const lines = [headers.join(',')];

      for (const row of rows) {
        const price = typeof row.price_cents === 'number' ? (row.price_cents / 100).toFixed(2) : '';
        const onHand = row.on_hand != null ? String(Number(row.on_hand)) : '';
        const tags = (row.tags ?? []).join(', ');

        const values = [
          row.brand_name ?? '',
          row.product_name ?? '',
          row.sku ?? '',
          row.size ?? '',
          row.color ?? '',
          price,
          onHand,
          tags,
          row.barcode ?? '',
        ].map((value) => csvEscape(value));

        lines.push(values.join(','));
      }

      const csv = lines.join('\n');

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="inventory-export.csv"')
        .send(csv);
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

      const filters = buildInventoryFilters(parsedQuery);
      const whereClause = buildWhereClause(filters);

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

  fastify.get(
    '/api/inventory/:id',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const params = InventoryDetailParamsSchema.parse(request.params);

      const variant = await fastify.prisma.variant.findUnique({
        where: { id: params.id },
        include: {
          product: {
            include: {
              brand: true,
              media: true,
              variants: {
                include: { media: true },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
          media: true,
        },
      });

      if (!variant) {
        reply.code(404).send({ message: 'Variant not found' });
        return;
      }

      const product = variant.product;
      const relatedVariants = product.variants;
      const onHandMap = await loadOnHandForVariants(
        fastify,
        relatedVariants.map((entry) => entry.id),
      );

      const variants = relatedVariants.map((entry) => ({
        id: entry.id,
        sku: entry.sku,
        size: entry.size,
        color: entry.color,
        priceCents: entry.priceCents ?? null,
        costPriceCents: entry.costPriceCents ?? null,
        onHand: onHandMap.get(entry.id) ?? 0,
        isPrimary: entry.id === variant.id,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      }));

      const mediaMap = new Map<string, Media>();
      for (const media of [...product.media, ...variant.media, ...relatedVariants.flatMap((entry) => entry.media)]) {
        if (!mediaMap.has(media.id)) {
          mediaMap.set(media.id, media);
        }
      }

      const mediaPreviews = (
        await Promise.all(
          Array.from(mediaMap.values()).map((media) => createMediaPreview(fastify, media)),
        )
      ).filter((preview): preview is NonNullable<Awaited<ReturnType<typeof createMediaPreview>>> => Boolean(preview));

      reply.send({
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          tags: product.tags,
          brand: {
            id: product.brand.id,
            name: product.brand.name,
          },
        },
        primaryVariantId: variant.id,
        variants,
        media: mediaPreviews,
      });
    },
  );

  fastify.get(
    '/api/variants/:id/ledger',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const params = InventoryDetailParamsSchema.parse(request.params);
      const query = StockLedgerQuerySchema.parse(request.query ?? {});
      const where: Prisma.StockLedgerWhereInput = {
        variantId: params.id,
        ...(query.type ? { type: query.type as StockLedgerType } : {}),
        ...(query.reason ? { reason: query.reason } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      };

      const limit = query.limit ?? 50;

      const [entries, reasons, onHand] = await Promise.all([
        fastify.prisma.stockLedger.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: { recordedBy: true },
        }),
        fastify.prisma.stockLedger.findMany({
          where: { variantId: params.id, reason: { not: null } },
          select: { reason: true },
          distinct: ['reason'],
        }),
        fetchCurrentOnHand(fastify, params.id),
      ]);

      reply.send({
        variantId: params.id,
        onHand,
        entries: entries.map((entry) => ({
          id: entry.id,
          type: entry.type,
          reason: entry.reason,
          reference: entry.reference,
          quantityChange: entry.quantityChange,
          recordedAt: entry.createdAt.toISOString(),
          recordedBy: entry.recordedBy
            ? {
                id: entry.recordedBy.id,
                firstName: entry.recordedBy.firstName,
                lastName: entry.recordedBy.lastName,
              }
            : null,
        })),
        availableTypes: StockLedgerTypeValues,
        availableReasons: reasons
          .map((row) => row.reason)
          .filter((reason): reason is string => Boolean(reason)),
      });
    },
  );

  fastify.post(
    '/api/variants/:id/adjustments',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const params = InventoryDetailParamsSchema.parse(request.params);
      const body = CreateStockAdjustmentBodySchema.parse(request.body);
      const user = (request as AuthenticatedRequest).user;

      const variant = await fastify.prisma.variant.findUnique({
        where: { id: params.id },
        select: { id: true },
      });

      if (!variant) {
        reply.code(404).send({ message: 'Variant not found' });
        return;
      }

      const currentOnHand = await fetchCurrentOnHand(fastify, params.id);
      const quantityChange = -body.quantity;

      if (currentOnHand + quantityChange < 0) {
        throw fastify.httpErrors.badRequest('Adjustment would reduce stock below zero');
      }

      const entry = await fastify.prisma.stockLedger.create({
        data: {
          id: randomUUID(),
          variantId: params.id,
          recordedById: user.sub,
          quantityChange,
          type: StockLedgerType.ADJUSTMENT,
          reason: body.reasonCode,
          reference: body.note ?? null,
        },
        include: { recordedBy: true },
      });

      const nextOnHand = currentOnHand + quantityChange;

      reply.code(201).send({
        id: entry.id,
        variantId: entry.variantId,
        quantityChange: entry.quantityChange,
        type: entry.type,
        reason: entry.reason,
        reference: entry.reference,
        recordedAt: entry.createdAt.toISOString(),
        recordedBy: entry.recordedBy
          ? {
              id: entry.recordedBy.id,
              firstName: entry.recordedBy.firstName,
              lastName: entry.recordedBy.lastName,
            }
          : null,
        onHand: nextOnHand,
      });
    },
  );

  fastify.get(
    '/api/variants/:id',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const params = VariantLookupParamsSchema.parse(request.params);

      const rows = await fastify.prisma.$queryRaw<
        Array<{
          variantId: string;
          productId: string;
          brandId: string;
          sku: string;
          barcode: string | null;
          priceCents: number | null;
          productName: string;
          brandName: string;
          size: string | null;
          color: string | null;
          onHand: bigint | number | null;
        }>
      >(
        Prisma.sql`
          SELECT
            v."id" AS "variantId",
            v."productId",
            p."brandId",
            v."sku",
            v."barcode",
            v."priceCents",
            p."name" AS "productName",
            b."name" AS "brandName",
            v."size",
            v."color",
            COALESCE(cs."on_hand", 0) AS "onHand"
          FROM "Variant" v
          JOIN "Product" p ON p."id" = v."productId"
          JOIN "Brand" b ON b."id" = p."brandId"
          LEFT JOIN "current_stock" cs ON cs."variant_id" = v."id"
          WHERE v."id" = ${params.id}
          LIMIT 1
        `,
      );

      if (rows.length === 0) {
        reply.code(404).send({ message: 'Variant not found' });
        return;
      }

      const row = rows[0];
      const payload = VariantLookupResponseSchema.parse({
        ...row,
        onHand: Number(row.onHand ?? 0),
      });

      reply.send(payload);
    },
  );

  fastify.get(
    '/api/scan/:barcode',
    { preHandler: requireRoles(STOCK_WRITE_ROLES) },
    async (request, reply) => {
      const params = BarcodeLookupParamsSchema.parse(request.params);

      const rows = await fastify.prisma.$queryRaw<
        Array<{
          variantId: string;
          productId: string;
          brandId: string;
          sku: string;
          barcode: string | null;
          priceCents: number | null;
          productName: string;
          brandName: string;
          size: string | null;
          color: string | null;
          onHand: bigint | number | null;
        }>
      >(
        Prisma.sql`
          SELECT
            v."id" AS "variantId",
            v."productId",
            p."brandId",
            v."sku",
            v."barcode",
            v."priceCents",
            p."name" AS "productName",
            b."name" AS "brandName",
            v."size",
            v."color",
            COALESCE(cs."on_hand", 0) AS "onHand"
          FROM "Variant" v
          JOIN "Product" p ON p."id" = v."productId"
          JOIN "Brand" b ON b."id" = p."brandId"
          LEFT JOIN "current_stock" cs ON cs."variant_id" = v."id"
          WHERE v."barcode" = ${params.barcode}
          LIMIT 1
        `,
      );

      if (rows.length === 0) {
        reply.code(404).send({ message: 'Variant not found' });
        return;
      }

      const row = rows[0];
      const payload = VariantLookupResponseSchema.parse({
        ...row,
        onHand: Number(row.onHand ?? 0),
      });

      reply.send(payload);
    },
  );
};

export default registerInventoryRoutes;
