import { z } from 'zod';

export const StockLedgerTypeValues = ['INITIAL_COUNT', 'ADJUSTMENT', 'RECEIPT', 'SALE'] as const;

export type StockLedgerType = (typeof StockLedgerTypeValues)[number];

export const InventoryDetailParamsSchema = z.object({
  id: z.string().uuid('Variant id must be a valid UUID'),
});

export const CreateBrandBodySchema = z.object({
  name: z.string().trim().min(1, 'Brand name is required'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
});

export type CreateBrandBody = z.infer<typeof CreateBrandBodySchema>;

export const CreateProductBodySchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description must be 1000 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
  category: z
    .string()
    .trim()
    .max(255, 'Category must be 255 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
  tags: z
    .array(z.string().trim().min(1))
    .optional()
    .transform((tags) => (tags ?? []).map((tag) => tag.trim()))
    .default([]),
  brandId: z.string().uuid('brandId must be a valid UUID'),
});

export type CreateProductBody = z.infer<typeof CreateProductBodySchema>;

export const CreateVariantBodySchema = z.object({
  productId: z.string().uuid('productId must be a valid UUID'),
  sku: z.string().trim().min(1, 'SKU is required'),
  size: z
    .string()
    .trim()
    .max(100, 'Size must be 100 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
  color: z
    .string()
    .trim()
    .max(100, 'Color must be 100 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
  priceCents: z.coerce
    .number()
    .int('priceCents must be an integer')
    .min(0, 'priceCents must be non-negative')
    .optional(),
  barcode: z
    .string()
    .trim()
    .max(255, 'Barcode must be 255 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
});

export type CreateVariantBody = z.infer<typeof CreateVariantBodySchema>;

export const CreateInitialStockBodySchema = z.object({
  variantId: z.string().uuid('variantId must be a valid UUID'),
  quantity: z.coerce
    .number()
    .int('quantity must be an integer')
    .min(0, 'quantity must be non-negative'),
  reason: z
    .string()
    .trim()
    .max(255, 'Reason must be 255 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
  reference: z
    .string()
    .trim()
    .max(255, 'Reference must be 255 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => (value === null ? undefined : value)),
});

export type CreateInitialStockBody = z.infer<typeof CreateInitialStockBodySchema>;

const tagQuery = z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]);

export const InventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  brandId: z.string().uuid().optional(),
  brand: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  size: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  tag: tagQuery.optional(),
  search: z.string().trim().min(1).optional(),
});

export type InventoryQuery = z.infer<typeof InventoryQuerySchema>;

export const InventoryItemSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  brandId: z.string(),
  sku: z.string(),
  brandName: z.string(),
  productName: z.string(),
  category: z.string().nullable(),
  size: z.string().nullable(),
  color: z.string().nullable(),
  tags: z.array(z.string()),
  priceCents: z.number().int().nonnegative().nullable(),
  onHand: z.number().int(),
  description: z.string().nullable(),
});

export const InventoryResponseSchema = z.object({
  data: z.array(InventoryItemSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    pageCount: z.number().int().min(0),
  }),
});

export type InventoryResponse = z.infer<typeof InventoryResponseSchema>;

export const StockLedgerQuerySchema = z
  .object({
    type: z.enum(StockLedgerTypeValues).optional(),
    reason: z.string().trim().min(1).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export const CreateStockAdjustmentBodySchema = z
  .object({
    reasonCode: z.enum(['damaged', 'lost']),
    quantity: z
      .number()
      .int('Quantity must be an integer')
      .positive('Quantity must be greater than zero'),
    note: z
      .string()
      .trim()
      .max(255, 'Note must be 255 characters or fewer')
      .optional(),
  })
  .strict();

export const inventoryOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Inventory API',
    version: '1.0.0',
    description:
      'Endpoints for managing product catalog, stock ledger, and querying current inventory levels.',
  },
  paths: {
    '/api/brands': {
      post: {
        summary: 'Create a brand',
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true, maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Brand created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'name', 'createdAt', 'updatedAt'],
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    description: { type: 'string', nullable: true },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/products': {
      post: {
        summary: 'Create a product',
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'brandId'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true, maxLength: 1000 },
                  category: { type: 'string', nullable: true, maxLength: 255 },
                  tags: { type: 'array', items: { type: 'string' } },
                  brandId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Product created',
          },
        },
      },
    },
    '/api/variants': {
      post: {
        summary: 'Create a product variant',
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productId', 'sku'],
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  sku: { type: 'string' },
                  size: { type: 'string', nullable: true },
                  color: { type: 'string', nullable: true },
                  priceCents: { type: 'integer', minimum: 0, nullable: true },
                  barcode: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Variant created',
          },
        },
      },
    },
    '/api/stock/initial': {
      post: {
        summary: 'Set initial stock for a variant',
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['variantId', 'quantity'],
                properties: {
                  variantId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 0 },
                  reason: { type: 'string', nullable: true },
                  reference: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Ledger entry recorded',
          },
        },
      },
    },
    '/api/inventory': {
      get: {
        summary: 'List inventory with filters and search',
        tags: ['Inventory'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 }, required: false },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
            required: false,
          },
          {
            name: 'brandId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
            required: false,
          },
          { name: 'brand', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'category', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'size', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'color', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'tag', in: 'query', schema: { type: 'string' }, required: false },
          { name: 'search', in: 'query', schema: { type: 'string' }, required: false },
        ],
        responses: {
          '200': {
            description: 'Inventory list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data', 'pagination'],
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: [
                          'variantId',
                          'productId',
                          'brandId',
                          'sku',
                          'brandName',
                          'productName',
                          'tags',
                          'onHand',
                        ],
                        properties: {
                          variantId: { type: 'string', format: 'uuid' },
                          productId: { type: 'string', format: 'uuid' },
                          brandId: { type: 'string', format: 'uuid' },
                          sku: { type: 'string' },
                          brandName: { type: 'string' },
                          productName: { type: 'string' },
                          category: { type: 'string', nullable: true },
                          size: { type: 'string', nullable: true },
                          color: { type: 'string', nullable: true },
                          tags: { type: 'array', items: { type: 'string' } },
                          priceCents: { type: 'integer', nullable: true },
                          onHand: { type: 'integer' },
                          description: { type: 'string', nullable: true },
                        },
                      },
                    },
                    pagination: {
                      type: 'object',
                      required: ['page', 'pageSize', 'total', 'pageCount'],
                      properties: {
                        page: { type: 'integer', minimum: 1 },
                        pageSize: { type: 'integer', minimum: 1, maximum: 100 },
                        total: { type: 'integer', minimum: 0 },
                        pageCount: { type: 'integer', minimum: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
} as const;
