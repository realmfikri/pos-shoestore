import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { requireRoles } from '../middleware/authGuard';
import {
  ReportDateRangeQuerySchema,
  TopReportQuerySchema,
  DailySalesReportResponse,
  TopItemsReportResponse,
  TopBrandsReportResponse,
  LowStockReportResponse,
} from '../types/reportContracts';
import {
  fetchDailySalesTotals,
  fetchLowStockVariants,
  fetchTopSellingBrands,
  fetchTopSellingItems,
  DateRange,
} from '../services/reporting';
import { reportingConfig } from '../config/reporting';

const REPORTING_ROLES: Role[] = [Role.OWNER, Role.MANAGER];

const buildDateRange = (query: { startDate?: string; endDate?: string }): DateRange => {
  let startDate: Date | undefined = query.startDate ? new Date(query.startDate) : undefined;
  let endDate: Date | undefined = query.endDate ? new Date(query.endDate) : undefined;

  if (!startDate && !endDate) {
    endDate = new Date();
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - reportingConfig.defaultDateRangeDays);
  } else if (startDate && !endDate) {
    endDate = new Date();
  } else if (!startDate && endDate) {
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - reportingConfig.defaultDateRangeDays);
  }

  return { startDate, endDate };
};

const buildCacheKey = (prefix: string, parts: Array<string | number | Date | undefined | null>) =>
  `${prefix}:${parts
    .map((part) => {
      if (part === undefined || part === null) {
        return 'null';
      }
      if (part instanceof Date) {
        return part.toISOString();
      }
      return String(part);
    })
    .join(':')}`;

export default async function registerReportsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/reports/sales/daily',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const parsed = ReportDateRangeQuerySchema.parse(request.query);
      const range = buildDateRange(parsed);
      const cacheKey = buildCacheKey('reports:daily-sales', [range.startDate, range.endDate]);

      const cached = await fastify.reportCache.get<DailySalesReportResponse>(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      try {
        const rows = await fetchDailySalesTotals(fastify.prisma, range);
        const response: DailySalesReportResponse = {
          results: rows.map((row) => ({
            saleDate: row.saleDate.toISOString(),
            grossSalesCents: row.grossSalesCents,
            discountTotalCents: row.discountTotalCents,
            taxTotalCents: row.taxTotalCents,
            netSalesCents: row.netSalesCents,
            saleCount: row.saleCount,
          })),
        };
        await fastify.reportCache.set(cacheKey, response, reportingConfig.cacheTtlSeconds);
        return reply.send(response);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to fetch daily sales report');
        return reply.status(400).send({
          message: error instanceof Error ? error.message : 'Unable to fetch daily sales report',
        });
      }
    },
  );

  fastify.get(
    '/api/reports/sales/top-items',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const parsed = TopReportQuerySchema.parse(request.query);
      const range = buildDateRange(parsed);
      const cacheKey = buildCacheKey('reports:top-items', [range.startDate, range.endDate, parsed.limit]);

      const cached = await fastify.reportCache.get<TopItemsReportResponse>(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      try {
        const rows = await fetchTopSellingItems(fastify.prisma, range, parsed.limit);
        const response: TopItemsReportResponse = {
          results: rows.map((row) => ({
            variantId: row.variantId,
            productId: row.productId,
            brandId: row.brandId,
            sku: row.sku,
            productName: row.productName,
            brandName: row.brandName,
            quantitySold: row.quantitySold,
            grossSalesCents: row.grossSalesCents,
            discountTotalCents: row.discountTotalCents,
            netSalesCents: row.netSalesCents,
            lastSoldAt: row.lastSoldAt ? row.lastSoldAt.toISOString() : null,
          })),
        };
        await fastify.reportCache.set(cacheKey, response, reportingConfig.cacheTtlSeconds);
        return reply.send(response);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to fetch top item report');
        return reply.status(400).send({
          message: error instanceof Error ? error.message : 'Unable to fetch top item report',
        });
      }
    },
  );

  fastify.get(
    '/api/reports/sales/top-brands',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const parsed = TopReportQuerySchema.parse(request.query);
      const range = buildDateRange(parsed);
      const cacheKey = buildCacheKey('reports:top-brands', [range.startDate, range.endDate, parsed.limit]);

      const cached = await fastify.reportCache.get<TopBrandsReportResponse>(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      try {
        const rows = await fetchTopSellingBrands(fastify.prisma, range, parsed.limit);
        const response: TopBrandsReportResponse = {
          results: rows.map((row) => ({
            brandId: row.brandId,
            brandName: row.brandName,
            quantitySold: row.quantitySold,
            grossSalesCents: row.grossSalesCents,
            discountTotalCents: row.discountTotalCents,
            netSalesCents: row.netSalesCents,
          })),
        };
        await fastify.reportCache.set(cacheKey, response, reportingConfig.cacheTtlSeconds);
        return reply.send(response);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to fetch top brand report');
        return reply.status(400).send({
          message: error instanceof Error ? error.message : 'Unable to fetch top brand report',
        });
      }
    },
  );

  fastify.get(
    '/api/reports/inventory/low-stock',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const cacheKey = 'reports:low-stock';
      const cached = await fastify.reportCache.get<LowStockReportResponse>(cacheKey);
      if (cached) {
        return reply.send(cached);
      }

      try {
        const rows = await fetchLowStockVariants(fastify.prisma);
        const response: LowStockReportResponse = {
          results: rows.map((row) => ({
            variantId: row.variantId,
            productId: row.productId,
            brandId: row.brandId,
            sku: row.sku,
            productName: row.productName,
            brandName: row.brandName,
            onHand: row.onHand,
            threshold: row.threshold,
          })),
        };
        await fastify.reportCache.set(cacheKey, response, reportingConfig.cacheTtlSeconds);
        return reply.send(response);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to fetch low stock report');
        return reply.status(500).send({
          message: 'Unable to fetch low stock report',
        });
      }
    },
  );
}
