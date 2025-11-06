import { Prisma, PrismaClient } from '@prisma/client';

export type DateRange = {
  startDate?: Date;
  endDate?: Date;
};

export type DailySalesRow = {
  saleDate: Date;
  grossSalesCents: number;
  discountTotalCents: number;
  taxTotalCents: number;
  netSalesCents: number;
  saleCount: number;
};

export type TopSellingItemRow = {
  variantId: string;
  productId: string;
  brandId: string;
  sku: string;
  productName: string;
  brandName: string;
  quantitySold: number;
  grossSalesCents: number;
  discountTotalCents: number;
  netSalesCents: number;
  lastSoldAt: Date | null;
};

export type TopSellingBrandRow = {
  brandId: string;
  brandName: string;
  quantitySold: number;
  grossSalesCents: number;
  discountTotalCents: number;
  netSalesCents: number;
};

export type LowStockRow = {
  variantId: string;
  productId: string;
  brandId: string;
  sku: string;
  productName: string;
  brandName: string;
  onHand: number;
  threshold: number;
};

const buildWhereClause = (filters: Prisma.Sql[]) =>
  filters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(filters, Prisma.sql` AND `)}` : Prisma.sql``;

const normalizeDateRange = (range: DateRange): DateRange => {
  if (range.startDate && isNaN(range.startDate.getTime())) {
    throw new Error('Invalid startDate');
  }

  if (range.endDate && isNaN(range.endDate.getTime())) {
    throw new Error('Invalid endDate');
  }

  if (range.startDate && range.endDate && range.startDate > range.endDate) {
    throw new Error('startDate must be before or equal to endDate');
  }

  return range;
};

export const fetchDailySalesTotals = async (
  prisma: PrismaClient,
  range: DateRange,
): Promise<DailySalesRow[]> => {
  const { startDate, endDate } = normalizeDateRange(range);
  const filters: Prisma.Sql[] = [];

  if (startDate) {
    filters.push(Prisma.sql`sale_date >= ${startDate}`);
  }

  if (endDate) {
    filters.push(Prisma.sql`sale_date <= ${endDate}`);
  }

  const whereClause = buildWhereClause(filters);

  return prisma.$queryRaw<DailySalesRow[]>(Prisma.sql`
    SELECT
      sale_date AS "saleDate",
      gross_sales_cents AS "grossSalesCents",
      discount_total_cents AS "discountTotalCents",
      tax_total_cents AS "taxTotalCents",
      net_sales_cents AS "netSalesCents",
      sale_count AS "saleCount"
    FROM daily_sales_totals
    ${whereClause}
    ORDER BY sale_date ASC
  `);
};

export const fetchTopSellingItems = async (
  prisma: PrismaClient,
  range: DateRange,
  limit: number,
): Promise<TopSellingItemRow[]> => {
  const { startDate, endDate } = normalizeDateRange(range);
  const filters: Prisma.Sql[] = [];

  if (startDate) {
    filters.push(Prisma.sql`sale_date >= ${startDate}`);
  }

  if (endDate) {
    filters.push(Prisma.sql`sale_date <= ${endDate}`);
  }

  const whereClause = buildWhereClause(filters);

  return prisma.$queryRaw<TopSellingItemRow[]>(Prisma.sql`
    SELECT
      variant_id AS "variantId",
      product_id AS "productId",
      brand_id AS "brandId",
      sku,
      product_name AS "productName",
      brand_name AS "brandName",
      SUM(quantity_sold)::INTEGER AS "quantitySold",
      SUM(gross_sales_cents)::INTEGER AS "grossSalesCents",
      SUM(discount_total_cents)::INTEGER AS "discountTotalCents",
      SUM(net_sales_cents)::INTEGER AS "netSalesCents",
      MAX(last_sold_at) AS "lastSoldAt"
    FROM sale_item_daily_metrics
    ${whereClause}
    GROUP BY variant_id, product_id, brand_id, sku, product_name, brand_name
    ORDER BY "quantitySold" DESC, "grossSalesCents" DESC
    LIMIT ${limit}
  `);
};

export const fetchTopSellingBrands = async (
  prisma: PrismaClient,
  range: DateRange,
  limit: number,
): Promise<TopSellingBrandRow[]> => {
  const { startDate, endDate } = normalizeDateRange(range);
  const filters: Prisma.Sql[] = [];

  if (startDate) {
    filters.push(Prisma.sql`sale_date >= ${startDate}`);
  }

  if (endDate) {
    filters.push(Prisma.sql`sale_date <= ${endDate}`);
  }

  const whereClause = buildWhereClause(filters);

  return prisma.$queryRaw<TopSellingBrandRow[]>(Prisma.sql`
    SELECT
      brand_id AS "brandId",
      brand_name AS "brandName",
      SUM(quantity_sold)::INTEGER AS "quantitySold",
      SUM(gross_sales_cents)::INTEGER AS "grossSalesCents",
      SUM(discount_total_cents)::INTEGER AS "discountTotalCents",
      SUM(net_sales_cents)::INTEGER AS "netSalesCents"
    FROM brand_daily_metrics
    ${whereClause}
    GROUP BY brand_id, brand_name
    ORDER BY "quantitySold" DESC, "grossSalesCents" DESC
    LIMIT ${limit}
  `);
};

export const fetchLowStockVariants = async (
  prisma: PrismaClient,
  limit?: number,
): Promise<LowStockRow[]> => {
  return prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
    SELECT
      variant_id AS "variantId",
      product_id AS "productId",
      brand_id AS "brandId",
      sku,
      product_name AS "productName",
      brand_name AS "brandName",
      on_hand AS "onHand",
      threshold
    FROM low_stock_variants
    ORDER BY on_hand ASC, sku ASC
    ${typeof limit === 'number' ? Prisma.sql`LIMIT ${limit}` : Prisma.sql``}
  `);
};
