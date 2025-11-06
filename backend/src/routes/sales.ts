import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { Prisma, Role, StockLedgerType } from '@prisma/client';
import { requireRoles, AuthenticatedRequest } from '../middleware/authGuard';
import {
  CreateSaleBodySchema,
  PaymentBreakdownSchema,
  SaleReceiptParamsSchema,
  SaleReceiptResponseSchema,
} from '../types/salesContracts';
import { storeSettings } from '../config/store';

const SALE_ROLES: Role[] = [Role.OWNER, Role.MANAGER, Role.EMPLOYEE];

type CalculatedSaleItem = {
  variantId: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  sku: string;
};

const registerSalesRoutes = async (fastify: FastifyInstance): Promise<void> => {
  fastify.post(
    '/api/sales',
    { preHandler: requireRoles(SALE_ROLES) },
    async (request, reply) => {
      const body = CreateSaleBodySchema.parse(request.body);
      const user = (request as AuthenticatedRequest).user;

      const calculatedItems: CalculatedSaleItem[] = [];
      let subtotalCents = 0;
      let itemDiscountCents = 0;

      for (const item of body.items) {
        const variant = await fastify.prisma.variant.findUnique({ where: { id: item.variantId } });

        if (!variant) {
          reply.code(400).send({ message: `Variant ${item.variantId} not found` });
          return;
        }

        const unitPriceCents = item.unitPriceCents ?? variant.priceCents ?? undefined;

        if (unitPriceCents === undefined) {
          reply.code(400).send({ message: `Variant ${variant.id} does not have a price set` });
          return;
        }

        const lineSubtotal = unitPriceCents * item.quantity;
        const lineDiscount = item.discountCents ?? 0;

        if (lineDiscount > lineSubtotal) {
          reply
            .code(400)
            .send({ message: `Discount for variant ${variant.id} exceeds the line subtotal` });
          return;
        }

        subtotalCents += lineSubtotal;
        itemDiscountCents += lineDiscount;

        calculatedItems.push({
          variantId: variant.id,
          quantity: item.quantity,
          unitPriceCents,
          discountCents: lineDiscount,
          sku: variant.sku,
        });
      }

      const discountTotalCents = itemDiscountCents + body.saleDiscountCents;

      if (discountTotalCents > subtotalCents) {
        reply.code(400).send({ message: 'Discounts cannot exceed the subtotal' });
        return;
      }

      const taxableBase = subtotalCents - discountTotalCents;
      const taxTotalCents = body.taxCents;
      const saleTotalCents = taxableBase + taxTotalCents;

      if (saleTotalCents < 0) {
        reply.code(400).send({ message: 'Total cannot be negative' });
        return;
      }

      const paymentsTotal = body.payments.reduce((total, payment) => total + payment.amountCents, 0);

      if (paymentsTotal !== saleTotalCents) {
        reply
          .code(400)
          .send({ message: 'Payment breakdown must match the sale total' });
        return;
      }

      const saleRecord = await fastify.prisma.$transaction(async (tx) => {
        const createdSale = await tx.sale.create({
          data: {
            id: randomUUID(),
            recordedById: user.sub,
            subtotalCents,
            saleDiscountCents: body.saleDiscountCents,
            discountTotalCents,
            taxTotalCents,
            totalCents: saleTotalCents,
            paymentBreakdown: body.payments as Prisma.JsonValue,
          },
        });

        for (const item of calculatedItems) {
          await tx.saleItem.create({
            data: {
              id: randomUUID(),
              saleId: createdSale.id,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              discountCents: item.discountCents,
            },
          });

          await tx.stockLedger.create({
            data: {
              id: randomUUID(),
              variantId: item.variantId,
              recordedById: user.sub,
              quantityChange: -item.quantity,
              type: StockLedgerType.SALE,
              reference: createdSale.id,
            },
          });
        }

        return createdSale;
      });

      const responsePayload = {
        id: saleRecord.id,
        subtotalCents,
        saleDiscountCents: body.saleDiscountCents,
        discountTotalCents,
        taxTotalCents,
        totalCents: saleTotalCents,
        payments: body.payments,
        items: calculatedItems.map((item) => ({
          variantId: item.variantId,
          sku: item.sku,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          discountCents: item.discountCents,
          lineSubtotalCents: item.unitPriceCents * item.quantity,
          lineTotalCents: item.unitPriceCents * item.quantity - item.discountCents,
        })),
      };

      reply.code(201).send(responsePayload);
    },
  );

  fastify.get(
    '/api/sales/:id/receipt',
    { preHandler: requireRoles(SALE_ROLES) },
    async (request, reply) => {
      const params = SaleReceiptParamsSchema.parse(request.params);

      const sale = await fastify.prisma.sale.findUnique({ where: { id: params.id } });

      if (!sale) {
        reply.code(404).send({ message: 'Sale not found' });
        return;
      }

      const saleItems = await fastify.prisma.saleItem.findMany({ where: { saleId: sale.id } });

      const uniqueVariantIds = [...new Set(saleItems.map((item) => item.variantId))];

      const variantDetails = await Promise.all(
        uniqueVariantIds.map(async (variantId) => {
          const rows = await fastify.prisma.$queryRaw<
            Array<{
              variantId: string;
              sku: string;
              productName: string;
            }>
          >(
            Prisma.sql`
              SELECT
                v."id" AS "variantId",
                v."sku",
                p."name" AS "productName"
              FROM "Variant" v
              JOIN "Product" p ON p."id" = v."productId"
              WHERE v."id" = ${variantId}
              LIMIT 1
            `,
          );

          return rows[0];
        }),
      );

      const variantMap = new Map(
        variantDetails
          .filter(
            (details): details is { variantId: string; sku: string; productName: string } =>
              Boolean(details),
          )
          .map((details) => [details.variantId, details]),
      );

      const items = saleItems.map((item) => {
        const variantDetails = variantMap.get(item.variantId);
        const lineSubtotal = item.unitPriceCents * item.quantity;
        return {
          variantId: item.variantId,
          sku: variantDetails?.sku ?? 'UNKNOWN',
          productName: variantDetails?.productName ?? 'Unknown Product',
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          discountCents: item.discountCents,
          lineTotalCents: lineSubtotal - item.discountCents,
        };
      });

      const payments = PaymentBreakdownSchema.parse(sale.paymentBreakdown);
      const paymentTotalCents = payments.reduce((total, entry) => total + entry.amountCents, 0);

      const receipt = SaleReceiptResponseSchema.parse({
        sale: {
          id: sale.id,
          createdAt: sale.createdAt.toISOString(),
          subtotalCents: sale.subtotalCents,
          saleDiscountCents: sale.saleDiscountCents,
          discountTotalCents: sale.discountTotalCents,
          taxTotalCents: sale.taxTotalCents,
          totalCents: sale.totalCents,
        },
        store: storeSettings,
        items,
        payments,
        totals: {
          subtotalCents: sale.subtotalCents,
          discountTotalCents: sale.discountTotalCents,
          taxTotalCents: sale.taxTotalCents,
          totalCents: sale.totalCents,
          paymentTotalCents,
        },
      });

      reply.send(receipt);
    },
  );

};

export default registerSalesRoutes;
