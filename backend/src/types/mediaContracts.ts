import { z } from 'zod';
import { MediaStatus } from './mediaStatus';

export const CreateSignedUrlBodySchema = z
  .object({
    fileName: z.string().min(1),
    contentType: z.string().min(1),
    productId: z.string().uuid().optional(),
    variantId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.productId && !value.variantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productId'],
        message: 'productId or variantId is required',
      });
    }
  });

export const CompleteUploadParamsSchema = z.object({
  mediaId: z.string().uuid(),
});

export const CompleteUploadBodySchema = z
  .object({
    sizeBytes: z.number().int().positive().optional(),
  })
  .optional()
  .default({});

export const MediaListQuerySchema = z
  .object({
    productId: z.string().uuid().optional(),
    variantId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.productId && !value.variantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'productId or variantId is required',
        path: ['productId'],
      });
    }
  });

export const MediaResponseSchema = z.object({
  id: z.string().uuid(),
  bucket: z.string(),
  key: z.string(),
  fileName: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  status: z.enum([
    MediaStatus.PENDING_UPLOAD,
    MediaStatus.READY,
    MediaStatus.PROCESSING,
    MediaStatus.OPTIMIZED,
    MediaStatus.FAILED,
  ]),
  optimizedKey: z.string().nullable(),
  uploadExpiresAt: z.string().datetime().nullable(),
  uploadedAt: z.string().datetime().nullable(),
  optimizedAt: z.string().datetime().nullable(),
  originalDeletedAt: z.string().datetime().nullable(),
  failureReason: z.string().nullable(),
  productId: z.string().uuid().nullable(),
  variantId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MediaListResponseSchema = z.array(MediaResponseSchema);

export type CreateSignedUrlBody = z.infer<typeof CreateSignedUrlBodySchema>;
export type CompleteUploadParams = z.infer<typeof CompleteUploadParamsSchema>;
export type CompleteUploadBody = z.infer<typeof CompleteUploadBodySchema>;
export type MediaListQuery = z.infer<typeof MediaListQuerySchema>;
export type MediaResponse = z.infer<typeof MediaResponseSchema>;
