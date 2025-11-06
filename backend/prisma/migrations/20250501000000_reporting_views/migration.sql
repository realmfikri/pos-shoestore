-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "SaleItem_createdAt_idx" ON "SaleItem"("createdAt");

-- CreateView
CREATE VIEW daily_sales_totals AS
SELECT
  DATE("createdAt") AS sale_date,
  COALESCE(SUM("subtotalCents")::INTEGER, 0) AS gross_sales_cents,
  COALESCE(SUM("discountTotalCents")::INTEGER, 0) AS discount_total_cents,
  COALESCE(SUM("taxTotalCents")::INTEGER, 0) AS tax_total_cents,
  COALESCE(SUM("totalCents")::INTEGER, 0) AS net_sales_cents,
  COUNT(*)::INTEGER AS sale_count
FROM "Sale"
GROUP BY sale_date;

-- CreateView
CREATE VIEW sale_item_daily_metrics AS
SELECT
  DATE(s."createdAt") AS sale_date,
  si."variantId" AS variant_id,
  v."productId" AS product_id,
  p."brandId" AS brand_id,
  v."sku",
  p."name" AS product_name,
  b."name" AS brand_name,
  COALESCE(SUM(si."quantity")::INTEGER, 0) AS quantity_sold,
  COALESCE(SUM(si."quantity" * si."unitPriceCents")::INTEGER, 0) AS gross_sales_cents,
  COALESCE(SUM(si."discountCents")::INTEGER, 0) AS discount_total_cents,
  COALESCE(SUM(si."quantity" * si."unitPriceCents" - si."discountCents")::INTEGER, 0) AS net_sales_cents,
  MAX(s."createdAt") AS last_sold_at
FROM "SaleItem" si
JOIN "Sale" s ON s."id" = si."saleId"
JOIN "Variant" v ON v."id" = si."variantId"
JOIN "Product" p ON p."id" = v."productId"
JOIN "Brand" b ON b."id" = p."brandId"
GROUP BY sale_date, si."variantId", v."productId", p."brandId", v."sku", p."name", b."name";

-- CreateView
CREATE VIEW brand_daily_metrics AS
SELECT
  sale_date,
  brand_id,
  brand_name,
  COALESCE(SUM(quantity_sold)::INTEGER, 0) AS quantity_sold,
  COALESCE(SUM(gross_sales_cents)::INTEGER, 0) AS gross_sales_cents,
  COALESCE(SUM(discount_total_cents)::INTEGER, 0) AS discount_total_cents,
  COALESCE(SUM(net_sales_cents)::INTEGER, 0) AS net_sales_cents
FROM sale_item_daily_metrics
GROUP BY sale_date, brand_id, brand_name;

-- CreateView
CREATE VIEW low_stock_variants AS
WITH threshold_setting AS (
  SELECT COALESCE(NULLIF(TRIM(value), '')::INTEGER, 0) AS threshold
  FROM "Setting"
  WHERE "key" = 'inventory.low_stock_threshold'
)
SELECT
  cs.variant_id,
  cs.product_id,
  cs.brand_id,
  cs.sku,
  cs.product_name,
  cs.brand_name,
  cs.on_hand,
  COALESCE(ts.threshold, 5) AS threshold
FROM current_stock cs
LEFT JOIN threshold_setting ts ON TRUE
WHERE cs.on_hand <= COALESCE(ts.threshold, 5);

-- Seed default low stock threshold
INSERT INTO "Setting" ("key", "value")
VALUES ('inventory.low_stock_threshold', '5')
ON CONFLICT ("key") DO NOTHING;
