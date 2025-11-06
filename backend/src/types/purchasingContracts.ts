import { z } from 'zod';

export const CreateSupplierBodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().min(1).optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
});

export const UpdateSupplierBodySchema = CreateSupplierBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  'At least one field must be provided',
);

export const SupplierParamsSchema = z.object({
  id: z.string().uuid('Supplier id must be a valid UUID'),
});

const PurchaseOrderItemSchema = z.object({
  variantId: z.string().uuid('Variant id must be a valid UUID'),
  quantityOrdered: z.number().int().positive('Quantity must be greater than zero'),
  costCents: z.number().int().nonnegative('Cost must be zero or greater').optional(),
});

export const CreatePurchaseOrderBodySchema = z.object({
  supplierId: z.string().uuid('Supplier id must be a valid UUID'),
  items: z.array(PurchaseOrderItemSchema).min(1, 'At least one item is required'),
});

export const PurchaseOrderParamsSchema = z.object({
  id: z.string().uuid('Purchase order id must be a valid UUID'),
});

export const ReceivePurchaseOrderBodySchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid('Item id must be a valid UUID'),
        quantityReceived: z
          .number()
          .int()
          .positive('Received quantity must be greater than zero'),
        costCents: z.number().int().nonnegative('Cost must be zero or greater').optional(),
      }),
    )
    .min(1, 'At least one receipt item is required'),
});
