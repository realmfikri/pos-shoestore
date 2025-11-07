import { z } from 'zod';

const isoDateString = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid ISO 8601 date',
  });

export const ReportDateRangeQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
});

export type ReportDateRangeQuery = z.infer<typeof ReportDateRangeQuerySchema>;

export const ReportExportFormatSchema = z.enum(['csv', 'pdf']).default('csv');

export type ReportExportFormat = z.infer<typeof ReportExportFormatSchema>;

export const TopReportQuerySchema = ReportDateRangeQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type TopReportQuery = z.infer<typeof TopReportQuerySchema>;

export const ReportExportQuerySchema = ReportDateRangeQuerySchema.extend({
  format: ReportExportFormatSchema,
});

export type ReportExportQuery = z.infer<typeof ReportExportQuerySchema>;

export const TopReportExportQuerySchema = TopReportQuerySchema.extend({
  format: ReportExportFormatSchema,
});

export type TopReportExportQuery = z.infer<typeof TopReportExportQuerySchema>;

export const LowStockExportQuerySchema = z.object({
  format: ReportExportFormatSchema,
});

export type LowStockExportQuery = z.infer<typeof LowStockExportQuerySchema>;

export const DailySalesReportItemSchema = z.object({
  saleDate: z.string(),
  grossSalesCents: z.number().int(),
  discountTotalCents: z.number().int(),
  taxTotalCents: z.number().int(),
  netSalesCents: z.number().int(),
  saleCount: z.number().int(),
});

export type DailySalesReportItem = z.infer<typeof DailySalesReportItemSchema>;

export const DailySalesReportResponseSchema = z.object({
  results: z.array(DailySalesReportItemSchema),
});

export type DailySalesReportResponse = z.infer<typeof DailySalesReportResponseSchema>;

export const TopItemReportItemSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  brandId: z.string(),
  sku: z.string(),
  productName: z.string(),
  brandName: z.string(),
  quantitySold: z.number().int(),
  grossSalesCents: z.number().int(),
  discountTotalCents: z.number().int(),
  netSalesCents: z.number().int(),
  lastSoldAt: z.string().nullable(),
});

export type TopItemReportItem = z.infer<typeof TopItemReportItemSchema>;

export const TopItemsReportResponseSchema = z.object({
  results: z.array(TopItemReportItemSchema),
});

export type TopItemsReportResponse = z.infer<typeof TopItemsReportResponseSchema>;

export const TopBrandReportItemSchema = z.object({
  brandId: z.string(),
  brandName: z.string(),
  quantitySold: z.number().int(),
  grossSalesCents: z.number().int(),
  discountTotalCents: z.number().int(),
  netSalesCents: z.number().int(),
});

export type TopBrandReportItem = z.infer<typeof TopBrandReportItemSchema>;

export const TopBrandsReportResponseSchema = z.object({
  results: z.array(TopBrandReportItemSchema),
});

export type TopBrandsReportResponse = z.infer<typeof TopBrandsReportResponseSchema>;

export const LowStockItemSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  brandId: z.string(),
  sku: z.string(),
  productName: z.string(),
  brandName: z.string(),
  onHand: z.number().int(),
  threshold: z.number().int(),
});

export type LowStockItem = z.infer<typeof LowStockItemSchema>;

export const LowStockReportResponseSchema = z.object({
  results: z.array(LowStockItemSchema),
});

export type LowStockReportResponse = z.infer<typeof LowStockReportResponseSchema>;
