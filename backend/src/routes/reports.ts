import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { requireRoles } from '../middleware/authGuard';
import {
  ReportDateRangeQuerySchema,
  ReportExportQuerySchema,
  TopReportQuerySchema,
  TopReportExportQuerySchema,
  LowStockExportQuerySchema,
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
import { buildCsv, buildFileName, createPdfStream, describeRange, formatIdr } from '../utils/reportExport';

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
    '/api/reports/sales/daily/export',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const parsed = ReportExportQuerySchema.parse(request.query);
      const range = buildDateRange(parsed);

      try {
        const rows = await fetchDailySalesTotals(fastify.prisma, range);
        const normalized = rows.map((row) => ({
          saleDate: row.saleDate,
          saleCount: row.saleCount,
          grossSalesCents: row.grossSalesCents,
          discountTotalCents: row.discountTotalCents,
          taxTotalCents: row.taxTotalCents,
          netSalesCents: row.netSalesCents,
        }));

        const dateFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' });
        const columns = [
          { key: 'saleDate', header: 'Tanggal', accessor: (row: typeof normalized[number]) => dateFormatter.format(row.saleDate) },
          { key: 'saleCount', header: 'Transaksi', accessor: (row: typeof normalized[number]) => row.saleCount },
          {
            key: 'grossSalesCents',
            header: 'Penjualan Kotor',
            accessor: (row: typeof normalized[number]) => formatIdr(row.grossSalesCents),
          },
          {
            key: 'discountTotalCents',
            header: 'Diskon',
            accessor: (row: typeof normalized[number]) => formatIdr(row.discountTotalCents),
          },
          {
            key: 'taxTotalCents',
            header: 'Pajak',
            accessor: (row: typeof normalized[number]) => formatIdr(row.taxTotalCents),
          },
          {
            key: 'netSalesCents',
            header: 'Penjualan Bersih',
            accessor: (row: typeof normalized[number]) => formatIdr(row.netSalesCents),
          },
        ];

        if (parsed.format === 'csv') {
          const csv = buildCsv(columns, normalized);
          const filename = buildFileName('daily-sales', 'csv', range.startDate, range.endDate);
          return reply
            .type('text/csv')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(csv);
        }

        const stream = createPdfStream(
          'Ringkasan Penjualan Harian',
          describeRange(range.startDate, range.endDate),
          columns,
          normalized,
        );
        const filename = buildFileName('daily-sales', 'pdf', range.startDate, range.endDate);
        reply
          .type('application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(stream);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to export daily sales report');
        return reply.status(400).send({
          message: error instanceof Error ? error.message : 'Unable to export daily sales report',
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
    '/api/reports/sales/top-items/export',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const parsed = TopReportExportQuerySchema.parse(request.query);
      const range = buildDateRange(parsed);

      try {
        const rows = await fetchTopSellingItems(fastify.prisma, range, parsed.limit);
        const normalized = rows.map((row) => ({
          sku: row.sku,
          productName: row.productName,
          brandName: row.brandName,
          quantitySold: row.quantitySold,
          grossSalesCents: row.grossSalesCents,
          discountTotalCents: row.discountTotalCents,
          netSalesCents: row.netSalesCents,
          lastSoldAt: row.lastSoldAt,
        }));

        const dateFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        const columns = [
          { key: 'sku', header: 'SKU', accessor: (row: typeof normalized[number]) => row.sku },
          { key: 'productName', header: 'Produk', accessor: (row: typeof normalized[number]) => row.productName },
          { key: 'brandName', header: 'Merek', accessor: (row: typeof normalized[number]) => row.brandName },
          {
            key: 'quantitySold',
            header: 'Terjual',
            accessor: (row: typeof normalized[number]) => row.quantitySold,
          },
          {
            key: 'netSalesCents',
            header: 'Penjualan Bersih',
            accessor: (row: typeof normalized[number]) => formatIdr(row.netSalesCents),
          },
          {
            key: 'lastSoldAt',
            header: 'Terakhir Terjual',
            accessor: (row: typeof normalized[number]) =>
              row.lastSoldAt ? dateFormatter.format(row.lastSoldAt) : '—',
          },
        ];

        if (parsed.format === 'csv') {
          const csv = buildCsv(columns, normalized);
          const filename = buildFileName('top-items', 'csv', range.startDate, range.endDate);
          return reply
            .type('text/csv')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(csv);
        }

        const stream = createPdfStream(
          'Produk Terlaris',
          describeRange(range.startDate, range.endDate),
          columns,
          normalized,
        );
        const filename = buildFileName('top-items', 'pdf', range.startDate, range.endDate);
        reply
          .type('application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(stream);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to export top item report');
        return reply.status(400).send({
          message: error instanceof Error ? error.message : 'Unable to export top item report',
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
    '/api/reports/sales/top-brands/export',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const parsed = TopReportExportQuerySchema.parse(request.query);
      const range = buildDateRange(parsed);

      try {
        const rows = await fetchTopSellingBrands(fastify.prisma, range, parsed.limit);
        const normalized = rows.map((row) => ({
          brandName: row.brandName,
          quantitySold: row.quantitySold,
          grossSalesCents: row.grossSalesCents,
          discountTotalCents: row.discountTotalCents,
          netSalesCents: row.netSalesCents,
        }));

        const columns = [
          { key: 'brandName', header: 'Merek', accessor: (row: typeof normalized[number]) => row.brandName },
          {
            key: 'quantitySold',
            header: 'Unit Terjual',
            accessor: (row: typeof normalized[number]) => row.quantitySold,
          },
          {
            key: 'netSalesCents',
            header: 'Penjualan Bersih',
            accessor: (row: typeof normalized[number]) => formatIdr(row.netSalesCents),
          },
        ];

        if (parsed.format === 'csv') {
          const csv = buildCsv(columns, normalized);
          const filename = buildFileName('top-brands', 'csv', range.startDate, range.endDate);
          return reply
            .type('text/csv')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(csv);
        }

        const stream = createPdfStream(
          'Merek Terlaris',
          describeRange(range.startDate, range.endDate),
          columns,
          normalized,
        );
        const filename = buildFileName('top-brands', 'pdf', range.startDate, range.endDate);
        reply
          .type('application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(stream);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to export top brand report');
        return reply.status(400).send({
          message: error instanceof Error ? error.message : 'Unable to export top brand report',
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

  fastify.get(
    '/api/reports/inventory/low-stock/export',
    { preHandler: requireRoles(REPORTING_ROLES) },
    async (request, reply) => {
      const parsed = LowStockExportQuerySchema.parse(request.query);

      try {
        const rows = await fetchLowStockVariants(fastify.prisma);
        const normalized = rows.map((row) => ({
          sku: row.sku,
          productName: row.productName,
          brandName: row.brandName,
          onHand: row.onHand,
          threshold: row.threshold,
        }));

        const columns = [
          { key: 'sku', header: 'SKU', accessor: (row: typeof normalized[number]) => row.sku },
          { key: 'productName', header: 'Produk', accessor: (row: typeof normalized[number]) => row.productName },
          { key: 'brandName', header: 'Merek', accessor: (row: typeof normalized[number]) => row.brandName },
          { key: 'onHand', header: 'Stok Saat Ini', accessor: (row: typeof normalized[number]) => row.onHand },
          { key: 'threshold', header: 'Ambang Batas', accessor: (row: typeof normalized[number]) => row.threshold },
        ];

        if (parsed.format === 'csv') {
          const csv = buildCsv(columns, normalized);
          const filename = 'low-stock.csv';
          return reply
            .type('text/csv')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(csv);
        }

        const stream = createPdfStream('Persediaan Hampir Habis', null, columns, normalized);
        const filename = 'low-stock.pdf';
        reply
          .type('application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(stream);
      } catch (error) {
        request.log.warn({ err: error }, 'Failed to export low stock report');
        return reply.status(500).send({
          message: 'Unable to export low stock report',
        });
      }
    },
  );
}
