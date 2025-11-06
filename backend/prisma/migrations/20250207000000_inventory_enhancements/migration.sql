-- CreateEnum
CREATE TYPE "StockLedgerType" AS ENUM ('INITIAL_COUNT', 'ADJUSTMENT', 'RECEIPT', 'SALE');

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("description", '')), 'B')
    ) STORED,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("description", '')), 'B') ||
        setweight(to_tsvector('simple', coalesce("category", '')), 'C')
    ) STORED,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "priceCents" INTEGER,
    "barcode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "recordedById" TEXT,
    "quantityChange" INTEGER NOT NULL,
    "type" "StockLedgerType" NOT NULL,
    "reason" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_sku_key" ON "Variant"("sku");

-- CreateIndex
CREATE INDEX "Variant_productId_idx" ON "Variant"("productId");

-- CreateIndex
CREATE INDEX "StockLedger_variantId_idx" ON "StockLedger"("variantId");

-- CreateIndex
CREATE INDEX "StockLedger_recordedById_idx" ON "StockLedger"("recordedById");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extensions and indexes for search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Brand_searchVector_idx" ON "Brand" USING GIN ("searchVector");
CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");
CREATE INDEX "Brand_name_trgm_idx" ON "Brand" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX "Variant_sku_trgm_idx" ON "Variant" USING GIN (lower("sku") gin_trgm_ops);

-- Create view for current stock
CREATE VIEW "current_stock" AS
SELECT
    v."id" AS variant_id,
    p."id" AS product_id,
    b."id" AS brand_id,
    COALESCE(SUM(sl."quantityChange"), 0) AS on_hand,
    v."sku" AS sku,
    b."name" AS brand_name,
    p."name" AS product_name,
    p."category" AS category,
    v."size" AS size,
    v."color" AS color,
    COALESCE(p."tags", ARRAY[]::TEXT[]) AS tags,
    v."priceCents" AS price_cents
FROM "Variant" v
INNER JOIN "Product" p ON p."id" = v."productId"
INNER JOIN "Brand" b ON b."id" = p."brandId"
LEFT JOIN "StockLedger" sl ON sl."variantId" = v."id"
GROUP BY v."id", p."id", b."id", v."sku", b."name", p."name", p."category", v."size", v."color", p."tags", v."priceCents";
