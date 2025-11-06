import { z } from 'zod';

export const SaleItemInputSchema = z.object({
  variantId: z.string().uuid('variantId must be a valid UUID'),
  quantity: z
    .number()
    .int('quantity must be an integer')
    .min(1, 'quantity must be greater than zero'),
  unitPriceCents: z
    .number({ coerce: true })
    .int('unitPriceCents must be an integer')
    .min(0, 'unitPriceCents must be non-negative')
    .optional(),
  discountCents: z
    .number({ coerce: true })
    .int('discountCents must be an integer')
    .min(0, 'discountCents must be non-negative')
    .optional(),
});

export type SaleItemInput = z.infer<typeof SaleItemInputSchema>;

export const PaymentBreakdownSchema = z
  .array(
    z.object({
      method: z.string().trim().min(1, 'method is required'),
      amountCents: z
        .number({ coerce: true })
        .int('amountCents must be an integer')
        .min(0, 'amountCents must be non-negative'),
    }),
  )
  .min(1, 'At least one payment is required');

export type PaymentBreakdown = z.infer<typeof PaymentBreakdownSchema>;

export const CreateSaleBodySchema = z.object({
  items: z.array(SaleItemInputSchema).min(1, 'At least one item is required'),
  saleDiscountCents: z
    .number({ coerce: true })
    .int('saleDiscountCents must be an integer')
    .min(0, 'saleDiscountCents must be non-negative')
    .default(0),
  taxCents: z
    .number({ coerce: true })
    .int('taxCents must be an integer')
    .min(0, 'taxCents must be non-negative')
    .default(0),
  payments: PaymentBreakdownSchema,
});

export type CreateSaleBody = z.infer<typeof CreateSaleBodySchema>;

export const SaleReceiptParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export type SaleReceiptParams = z.infer<typeof SaleReceiptParamsSchema>;

export const VariantLookupParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export type VariantLookupParams = z.infer<typeof VariantLookupParamsSchema>;

export const BarcodeLookupParamsSchema = z.object({
  barcode: z.string().trim().min(1, 'barcode is required'),
});

export type BarcodeLookupParams = z.infer<typeof BarcodeLookupParamsSchema>;

export const VariantLookupResponseSchema = z.object({
  variantId: z.string(),
  productId: z.string(),
  brandId: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
  productName: z.string(),
  brandName: z.string(),
  size: z.string().nullable(),
  color: z.string().nullable(),
  onHand: z.number().int(),
});

export type VariantLookupResponse = z.infer<typeof VariantLookupResponseSchema>;

export const SaleReceiptItemSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  discountCents: z.number().int(),
  lineTotalCents: z.number().int(),
});

export type SaleReceiptItem = z.infer<typeof SaleReceiptItemSchema>;

export const SaleReceiptResponseSchema = z.object({
  sale: z.object({
    id: z.string(),
    createdAt: z.string(),
    subtotalCents: z.number().int(),
    saleDiscountCents: z.number().int(),
    discountTotalCents: z.number().int(),
    taxTotalCents: z.number().int(),
    totalCents: z.number().int(),
  }),
  store: z.object({
    name: z.string(),
    address: z.string(),
    phone: z.string(),
  }),
  items: z.array(SaleReceiptItemSchema),
  payments: PaymentBreakdownSchema,
  totals: z.object({
    subtotalCents: z.number().int(),
    discountTotalCents: z.number().int(),
    taxTotalCents: z.number().int(),
    totalCents: z.number().int(),
    paymentTotalCents: z.number().int(),
  }),
});

export type SaleReceiptResponse = z.infer<typeof SaleReceiptResponseSchema>;
