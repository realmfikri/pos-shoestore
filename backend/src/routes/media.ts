import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import type { Media } from '@prisma/client';
import { requireRoles } from '../middleware/authGuard';
import { env } from '../config/env';
import {
  CompleteUploadBodySchema,
  CompleteUploadParamsSchema,
  CreateSignedUrlBodySchema,
  MediaListQuerySchema,
  MediaResponse,
} from '../types/mediaContracts';
import { MediaStatus } from '../types/mediaStatus';

const MEDIA_WRITE_ROLES: Role[] = [Role.OWNER, Role.EMPLOYEE];

const sanitizeFileName = (fileName: string) =>
  fileName
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_');

const toResponse = (media: Media): MediaResponse => ({
  id: media.id,
  bucket: media.bucket,
  key: media.key,
  fileName: media.fileName,
  contentType: media.contentType,
  sizeBytes: media.sizeBytes,
  status: media.status,
  optimizedKey: media.optimizedKey,
  uploadExpiresAt: media.uploadExpiresAt ? media.uploadExpiresAt.toISOString() : null,
  uploadedAt: media.uploadedAt ? media.uploadedAt.toISOString() : null,
  optimizedAt: media.optimizedAt ? media.optimizedAt.toISOString() : null,
  originalDeletedAt: media.originalDeletedAt ? media.originalDeletedAt.toISOString() : null,
  failureReason: media.failureReason,
  productId: media.productId,
  variantId: media.variantId,
  createdAt: media.createdAt.toISOString(),
  updatedAt: media.updatedAt.toISOString(),
});

const registerMediaRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post(
    '/api/media/signed-url',
    { preHandler: requireRoles(MEDIA_WRITE_ROLES) },
    async (request, reply) => {
      const body = CreateSignedUrlBodySchema.parse(request.body);

      if (body.variantId) {
        const variant = await fastify.prisma.variant.findUnique({
          where: { id: body.variantId },
          select: { id: true, productId: true },
        });

        if (!variant) {
          reply.code(404).send({ message: 'Variant not found' });
          return;
        }

        if (body.productId && body.productId !== variant.productId) {
          reply
            .code(400)
            .send({ message: 'variantId does not belong to the specified productId' });
          return;
        }

        body.productId = variant.productId;
      } else if (body.productId) {
        const product = await fastify.prisma.product.findUnique({
          where: { id: body.productId },
          select: { id: true },
        });

        if (!product) {
          reply.code(404).send({ message: 'Product not found' });
          return;
        }
      }

      const targetId = body.variantId ?? body.productId!;
      const basePath = body.variantId ? 'variants' : 'products';
      const safeFileName = sanitizeFileName(body.fileName);
      const fileKey = `${basePath}/${targetId}/${Date.now()}-${randomUUID()}-${safeFileName}`;
      const expiresInSeconds = env.MEDIA_SIGNED_URL_EXPIRY_SECONDS;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      const uploadUrl = await fastify.minio.presignedPutObject(
        fastify.mediaBucket,
        fileKey,
        expiresInSeconds,
        { 'Content-Type': body.contentType },
      );

      const media = await fastify.prisma.media.create({
        data: {
          productId: body.productId,
          variantId: body.variantId ?? null,
          bucket: fastify.mediaBucket,
          key: fileKey,
          fileName: body.fileName,
          contentType: body.contentType,
          status: MediaStatus.PENDING_UPLOAD,
          uploadExpiresAt: expiresAt,
        },
      });

      reply.send({
        mediaId: media.id,
        uploadUrl,
        fileKey,
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  fastify.post(
    '/api/media/:mediaId/complete',
    { preHandler: requireRoles(MEDIA_WRITE_ROLES) },
    async (request, reply) => {
      const params = CompleteUploadParamsSchema.parse(request.params);
      const body = CompleteUploadBodySchema.parse(request.body ?? {});

      const media = await fastify.prisma.media.findUnique({ where: { id: params.mediaId } });

      if (!media) {
        reply.code(404).send({ message: 'Media not found' });
        return;
      }

      if (media.status !== MediaStatus.PENDING_UPLOAD) {
        reply.code(409).send({ message: 'Media is not awaiting upload' });
        return;
      }

      let stat;
      try {
        stat = await fastify.minio.statObject(media.bucket, media.key);
      } catch {
        reply.code(400).send({ message: 'Media object not found in storage' });
        return;
      }

      const nextStatus = fastify.mediaOptimizationEnabled
        ? MediaStatus.PROCESSING
        : MediaStatus.READY;

      const updated = await fastify.prisma.media.update({
        where: { id: media.id },
        data: {
          status: nextStatus,
          sizeBytes: body.sizeBytes ?? (typeof stat?.size === 'number' ? stat.size : null),
          uploadedAt: new Date(),
          uploadExpiresAt: null,
          failureReason: null,
        },
      });

      if (fastify.mediaOptimizationEnabled) {
        fastify.imageOptimizationQueue.enqueue({
          mediaId: media.id,
          objectKey: media.key,
        });
      }

      reply.send(toResponse(updated));
    },
  );

  fastify.get(
    '/api/media',
    { preHandler: requireRoles(MEDIA_WRITE_ROLES) },
    async (request, reply) => {
      const query = MediaListQuerySchema.parse(request.query);

      const mediaItems = await fastify.prisma.media.findMany({
        where: {
          productId: query.productId ?? undefined,
          variantId: query.variantId ?? undefined,
        },
        orderBy: { createdAt: 'desc' },
      });

      reply.send(mediaItems.map(toResponse));
    },
  );
};

export default registerMediaRoutes;
