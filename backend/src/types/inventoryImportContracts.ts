import { z } from 'zod';

export const InventoryImportActionValues = [
  'CREATE_BRAND',
  'CREATE_PRODUCT',
  'CREATE_VARIANT',
  'UPDATE_VARIANT',
  'ADJUST_STOCK',
  'SKIP',
] as const;

export type InventoryImportAction = (typeof InventoryImportActionValues)[number];

export const InventoryImportIssueSeverityValues = ['error', 'warning'] as const;

export type InventoryImportIssueSeverity = (typeof InventoryImportIssueSeverityValues)[number];

export const InventoryImportIssueTypeValues = [
  'DUPLICATE_IN_FILE',
  'CONFLICTING_RECORD',
  'INVALID_FIELD',
  'MISSING_DEPENDENCY',
] as const;

export type InventoryImportIssueType = (typeof InventoryImportIssueTypeValues)[number];

export const InventoryImportRowSchema = z.object({
  brandName: z.string().min(1),
  productName: z.string().min(1),
  sku: z.string().min(1),
  size: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  priceCents: z.number().int().nonnegative().nullable().optional(),
  onHand: z.number().int().nonnegative().nullable().optional(),
  tags: z.array(z.string().min(1)).default([]),
  barcode: z.string().min(1).optional(),
});

export type InventoryImportRow = z.infer<typeof InventoryImportRowSchema>;

export const InventoryImportIssueSchema = z.object({
  type: z.enum(InventoryImportIssueTypeValues),
  severity: z.enum(InventoryImportIssueSeverityValues),
  message: z.string(),
});

export type InventoryImportIssue = z.infer<typeof InventoryImportIssueSchema>;

export const InventoryImportPreviewRowSchema = z.object({
  index: z.number().int().min(1),
  row: InventoryImportRowSchema,
  actions: z.array(z.enum(InventoryImportActionValues)),
  issues: z.array(InventoryImportIssueSchema),
  blocking: z.boolean(),
});

export type InventoryImportPreviewRow = z.infer<typeof InventoryImportPreviewRowSchema>;

export const InventoryImportPreviewSummarySchema = z.object({
  totalRows: z.number().int().nonnegative(),
  create: z.object({
    brands: z.number().int().nonnegative(),
    products: z.number().int().nonnegative(),
    variants: z.number().int().nonnegative(),
  }),
  update: z.object({
    variants: z.number().int().nonnegative(),
    priceChanges: z.number().int().nonnegative(),
    stockAdjustments: z.number().int().nonnegative(),
  }),
  duplicates: z.array(
    z.object({
      sku: z.string(),
      rows: z.array(z.number().int().min(1)),
      message: z.string(),
    }),
  ),
  blockingIssueCount: z.number().int().nonnegative(),
});

export type InventoryImportPreviewSummary = z.infer<typeof InventoryImportPreviewSummarySchema>;

export const InventoryImportPreviewResponseSchema = z.object({
  rows: z.array(InventoryImportPreviewRowSchema),
  summary: InventoryImportPreviewSummarySchema,
});

export type InventoryImportPreviewResponse = z.infer<typeof InventoryImportPreviewResponseSchema>;

export const InventoryImportApplyResponseSchema = z.object({
  batchId: z.string(),
  status: z.enum(['QUEUED', 'PROCESSING', 'COMPLETED']),
  summary: InventoryImportPreviewSummarySchema.optional(),
});

export type InventoryImportApplyResponse = z.infer<typeof InventoryImportApplyResponseSchema>;
