import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import {
  Role,
  StockLedgerType,
  PurchaseOrderStatus,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  Supplier,
  User,
} from '@prisma/client';
import { requireRoles, AuthenticatedRequest } from '../middleware/authGuard';
import {
  CreateSupplierBodySchema,
  UpdateSupplierBodySchema,
  SupplierParamsSchema,
  CreatePurchaseOrderBodySchema,
  PurchaseOrderParamsSchema,
  ReceivePurchaseOrderBodySchema,
  PurchaseOrderListQuerySchema,
} from '../types/purchasingContracts';

const OWNER_ONLY = [Role.OWNER];

type VariantSummary = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  productId: string;
  productName: string;
  brandName: string;
};

const toSupplierSummary = (supplier: Supplier) => ({
  id: supplier.id,
  name: supplier.name,
  contact: supplier.contact,
  email: supplier.email,
  phone: supplier.phone,
  address: supplier.address,
  createdAt: supplier.createdAt.toISOString(),
  updatedAt: supplier.updatedAt.toISOString(),
});

const toPurchaseOrderItemSummary = (item: PurchaseOrderItem, variant: VariantSummary) => ({
  id: item.id,
  variant,
  quantityOrdered: item.quantityOrdered,
  quantityReceived: item.quantityReceived,
  costCents: item.costCents,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

const toGoodsReceiptSummary = (
  receipt: GoodsReceipt & { items: GoodsReceiptItem[]; receivedBy: User | null },
  itemVariantMap: Map<string, VariantSummary>,
) => ({
  id: receipt.id,
  purchaseOrderId: receipt.purchaseOrderId,
  receivedAt: receipt.receivedAt.toISOString(),
  createdAt: receipt.createdAt.toISOString(),
  receivedBy: receipt.receivedBy
    ? {
        id: receipt.receivedBy.id,
        firstName: receipt.receivedBy.firstName,
        lastName: receipt.receivedBy.lastName,
      }
    : null,
  items: receipt.items.map((item) => ({
    id: item.id,
    quantityReceived: item.quantityReceived,
    costCents: item.costCents,
    purchaseOrderItemId: item.purchaseOrderItemId,
    variant:
      itemVariantMap.get(item.purchaseOrderItemId) ??
      ({
        id: item.purchaseOrderItemId,
        sku: item.purchaseOrderItemId,
        size: null,
        color: null,
        productId: item.purchaseOrderItemId,
        productName: 'Unknown product',
        brandName: 'Unknown brand',
      } satisfies VariantSummary),
    createdAt: item.createdAt.toISOString(),
  })),
});

const buildPurchaseOrderResponse = async (fastify: FastifyInstance, order: PurchaseOrder) => {
  const [supplier, items, receiptsRaw] = await Promise.all([
    fastify.prisma.supplier.findUnique({ where: { id: order.supplierId } }),
    fastify.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: order.id },
      orderBy: { createdAt: 'asc' },
    }),
    fastify.prisma.goodsReceipt.findMany({
      where: { purchaseOrderId: order.id },
      orderBy: { receivedAt: 'desc' },
      include: {
        items: true,
        receivedBy: true,
      },
    }),
  ]);

  if (!supplier) {
    return null;
  }

  const receipts = await Promise.all(
    receiptsRaw.map(async (receipt) => {
      const receiptItems = Array.isArray((receipt as { items?: GoodsReceiptItem[] }).items)
        ? (receipt as { items: GoodsReceiptItem[] }).items
        : await fastify.prisma.goodsReceiptItem.findMany({
            where: { goodsReceiptId: receipt.id },
          });

      const receivedBy = (receipt as { receivedBy?: User | null }).receivedBy ?? null;

      return {
        ...receipt,
        items: receiptItems,
        receivedBy,
      };
    }),
  );

  const variantSummaries = new Map<string, VariantSummary>();
  const uniqueVariantIds = Array.from(new Set(items.map((item) => item.variantId)));

  await Promise.all(
    uniqueVariantIds.map(async (variantId) => {
      const variant = await fastify.prisma.variant.findUnique({
        where: { id: variantId },
        include: {
          product: {
            include: { brand: true },
          },
        },
      });

      if (!variant) {
        return;
      }

      variantSummaries.set(variantId, {
        id: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        productId: variant.productId,
        productName: variant.product?.name ?? 'Unknown product',
        brandName: variant.product?.brand?.name ?? 'Unknown brand',
      });
    }),
  );

  const itemVariantMap = new Map<string, VariantSummary>();
  for (const item of items) {
    const variantSummary =
      variantSummaries.get(item.variantId) ??
      ({
        id: item.variantId,
        sku: item.variantId,
        size: null,
        color: null,
        productId: item.variantId,
        productName: 'Unknown product',
        brandName: 'Unknown brand',
      } satisfies VariantSummary);
    itemVariantMap.set(item.id, variantSummary);
  }

  return {
    id: order.id,
    supplier: toSupplierSummary(supplier),
    supplierId: order.supplierId,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    orderedAt: order.orderedAt ? order.orderedAt.toISOString() : null,
    receivedAt: order.receivedAt ? order.receivedAt.toISOString() : null,
    createdById: order.createdById,
    items: items.map((item) => toPurchaseOrderItemSummary(item, itemVariantMap.get(item.id)!)),
    receipts: receipts.map((receipt) => toGoodsReceiptSummary(receipt, itemVariantMap)),
  };
};

const validatePurchaseOrderExists = async (
  fastify: FastifyInstance,
  orderId: string,
): Promise<PurchaseOrder | null> => {
  const order = await fastify.prisma.purchaseOrder.findUnique({ where: { id: orderId } });

  return order;
};

const registerPurchasingRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post(
    '/api/suppliers',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const body = CreateSupplierBodySchema.parse(request.body);

      const supplier = await fastify.prisma.supplier.create({
        data: {
          id: randomUUID(),
          name: body.name,
          contact: body.contact ?? null,
          email: body.email ?? null,
          phone: body.phone ?? null,
          address: body.address ?? null,
        },
      });

      reply.code(201).send(supplier);
    },
  );

  fastify.get(
    '/api/suppliers',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (_request, reply) => {
      const suppliers = await fastify.prisma.supplier.findMany();
      reply.send(suppliers);
    },
  );

  fastify.get(
    '/api/suppliers/:id',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const params = SupplierParamsSchema.parse(request.params);

      const supplier = await fastify.prisma.supplier.findUnique({ where: { id: params.id } });

      if (!supplier) {
        reply.code(404).send({ message: 'Supplier not found' });
        return;
      }

      reply.send(supplier);
    },
  );

  fastify.put(
    '/api/suppliers/:id',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const params = SupplierParamsSchema.parse(request.params);
      const body = UpdateSupplierBodySchema.parse(request.body);

      try {
        const supplier = await fastify.prisma.supplier.update({
          where: { id: params.id },
          data: body,
        });

        reply.send(supplier);
      } catch {
        reply.code(404).send({ message: 'Supplier not found' });
      }
    },
  );

  fastify.delete(
    '/api/suppliers/:id',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const params = SupplierParamsSchema.parse(request.params);

      try {
        await fastify.prisma.supplier.delete({ where: { id: params.id } });
        reply.code(204).send();
      } catch {
        reply.code(404).send({ message: 'Supplier not found' });
      }
    },
  );

  fastify.post(
    '/api/po',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const body = CreatePurchaseOrderBodySchema.parse(request.body);
      const user = (request as AuthenticatedRequest).user;

      const supplier = await fastify.prisma.supplier.findUnique({ where: { id: body.supplierId } });

      if (!supplier) {
        reply.code(404).send({ message: 'Supplier not found' });
        return;
      }

      for (const item of body.items) {
        const variant = await fastify.prisma.variant.findUnique({ where: { id: item.variantId } });
        if (!variant) {
          reply.code(400).send({ message: `Variant ${item.variantId} not found` });
          return;
        }
      }

      const order = await fastify.prisma.$transaction(async (tx) => {
        const createdOrder = await tx.purchaseOrder.create({
          data: {
            id: randomUUID(),
            supplierId: body.supplierId,
            createdById: user.sub,
            status: PurchaseOrderStatus.DRAFT,
          },
        });

        for (const item of body.items) {
          await tx.purchaseOrderItem.create({
            data: {
              id: randomUUID(),
              purchaseOrderId: createdOrder.id,
              variantId: item.variantId,
              quantityOrdered: item.quantityOrdered,
              costCents: item.costCents ?? null,
            },
          });
        }

        return createdOrder;
      });

      const response = await buildPurchaseOrderResponse(fastify, order);

      if (!response) {
        reply.code(500).send({ message: 'Failed to load purchase order' });
        return;
      }

      reply.code(201).send(response);
    },
  );

  fastify.get(
    '/api/po',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const query = PurchaseOrderListQuerySchema.parse(request.query ?? {});
      const where = {
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(query.status ? { status: query.status } : {}),
      };

      const orders = await fastify.prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      const responses = await Promise.all(
        orders.map(async (order) => buildPurchaseOrderResponse(fastify, order)),
      );

      reply.send(responses.filter((order): order is NonNullable<typeof order> => Boolean(order)));
    },
  );

  fastify.get(
    '/api/po/:id',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const params = PurchaseOrderParamsSchema.parse(request.params);
      const order = await validatePurchaseOrderExists(fastify, params.id);

      if (!order) {
        reply.code(404).send({ message: 'Purchase order not found' });
        return;
      }

      const response = await buildPurchaseOrderResponse(fastify, order);
      if (!response) {
        reply.code(500).send({ message: 'Failed to load purchase order' });
        return;
      }

      reply.send(response);
    },
  );

  fastify.post(
    '/api/po/:id/receive',
    { preHandler: requireRoles(OWNER_ONLY) },
    async (request, reply) => {
      const params = PurchaseOrderParamsSchema.parse(request.params);
      const body = ReceivePurchaseOrderBodySchema.parse(request.body);
      const user = (request as AuthenticatedRequest).user;

      const updatedOrder = await fastify.prisma.$transaction(async (tx) => {
        const order = await tx.purchaseOrder.findUnique({ where: { id: params.id } });

        if (!order) {
          return null;
        }

        if (order.status === PurchaseOrderStatus.CANCELLED) {
          throw fastify.httpErrors.badRequest('Cannot receive a cancelled purchase order');
        }

        if (order.status === PurchaseOrderStatus.RECEIVED) {
          throw fastify.httpErrors.badRequest('Purchase order is already fully received');
        }

        const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: params.id } });
        const itemsById = new Map(items.map((item) => [item.id, item]));

        const invalidItem = body.items.find((entry) => !itemsById.has(entry.itemId));
        if (invalidItem) {
          throw fastify.httpErrors.badRequest(`Item ${invalidItem.itemId} does not belong to this purchase order`);
        }

        const receiptId = randomUUID();
        const goodsReceipt: GoodsReceipt = await tx.goodsReceipt.create({
          data: {
            id: receiptId,
            purchaseOrderId: params.id,
            receivedById: user.sub,
          },
        });

        for (const entry of body.items) {
          const existing = itemsById.get(entry.itemId) as PurchaseOrderItem;
          const newReceivedTotal = existing.quantityReceived + entry.quantityReceived;

          if (newReceivedTotal > existing.quantityOrdered) {
            throw fastify.httpErrors.badRequest('Received quantity exceeds ordered quantity');
          }

          const resolvedCost = entry.costCents ?? existing.costCents ?? null;

          await tx.purchaseOrderItem.update({
            where: { id: entry.itemId },
            data: {
              quantityReceived: newReceivedTotal,
              costCents: resolvedCost,
            },
          });

          await tx.goodsReceiptItem.create({
            data: {
              id: randomUUID(),
              goodsReceiptId: goodsReceipt.id,
              purchaseOrderItemId: entry.itemId,
              quantityReceived: entry.quantityReceived,
              costCents: resolvedCost,
            },
          });

          await tx.stockLedger.create({
            data: {
              id: randomUUID(),
              variantId: existing.variantId,
              recordedById: user.sub,
              quantityChange: entry.quantityReceived,
              type: StockLedgerType.RECEIPT,
              reason: 'purchase',
              reference: goodsReceipt.id,
            },
          });

          if (resolvedCost !== null) {
            await tx.variant.update({
              where: { id: existing.variantId },
              data: { costPriceCents: resolvedCost },
            });
          }
        }

        const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: params.id } });
        const allReceived = refreshedItems.every(
          (item) => item.quantityReceived >= item.quantityOrdered && item.quantityOrdered > 0,
        );

        const nextStatus = allReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;

        return tx.purchaseOrder.update({
          where: { id: params.id },
          data: {
            status: nextStatus,
            receivedAt: allReceived ? new Date() : order.receivedAt,
          },
        });
      });

      if (!updatedOrder) {
        reply.code(404).send({ message: 'Purchase order not found' });
        return;
      }

      const response = await buildPurchaseOrderResponse(fastify, updatedOrder);

      if (!response) {
        reply.code(500).send({ message: 'Failed to load purchase order' });
        return;
      }

      reply.send(response);
    },
  );
};

export default registerPurchasingRoutes;
