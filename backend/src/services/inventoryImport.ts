import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { InventoryImportStatus, Prisma, PrismaClient, StockLedgerType } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import {
  InventoryImportAction,
  InventoryImportIssue,
  InventoryImportIssueSeverity,
  InventoryImportPreviewRow,
  InventoryImportPreviewSummary,
  InventoryImportRow,
  InventoryImportRowSchema,
} from '../types/inventoryImportContracts';

type NormalisedRow = InventoryImportRow & {
  index: number;
};

type ExistingBrand = {
  id: string;
  name: string;
};

type ExistingProduct = {
  id: string;
  brandId: string;
  name: string;
};

type ExistingVariant = {
  id: string;
  sku: string;
  productId: string;
  size: string | null;
  color: string | null;
  priceCents: number | null;
  barcode: string | null;
  productName: string;
  brandId: string;
  brandName: string;
};

type VariantStockState = {
  onHand: number;
  hasInitial: boolean;
};

const HEADER_ALIASES: Record<string, keyof InventoryImportRow | 'price' | 'quantity'> = {
  brand: 'brandName',
  brandname: 'brandName',
  brand_label: 'brandName',
  brandlabel: 'brandName',
  manufacturer: 'brandName',
  model: 'productName',
  product: 'productName',
  productname: 'productName',
  style: 'productName',
  sku: 'sku',
  skucode: 'sku',
  code: 'sku',
  size: 'size',
  dimension: 'size',
  sizing: 'size',
  color: 'color',
  colour: 'color',
  shade: 'color',
  price: 'price',
  retailprice: 'price',
  pricecents: 'priceCents',
  cost: 'price',
  onhand: 'quantity',
  quantity: 'quantity',
  qty: 'quantity',
  stock: 'quantity',
  inventory: 'quantity',
  tags: 'tags',
  taglist: 'tags',
  keywords: 'tags',
  barcode: 'barcode',
  upc: 'barcode',
  ean: 'barcode',
  gtin: 'barcode',
};

const normaliseHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

const toNullableString = (value?: string | null) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const parsePrice = (raw?: string | null) => {
  if (!raw) {
    return undefined;
  }

  const cleaned = raw.replace(/[^0-9.,-]/g, '');
  if (cleaned.length === 0) {
    return undefined;
  }

  const normalised = cleaned.replace(/,/g, '.');
  const parsed = Number.parseFloat(normalised);

  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.round(parsed * 100);
};

const parseQuantity = (raw?: string | null) => {
  if (!raw) {
    return undefined;
  }

  const cleaned = raw.replace(/[^0-9-]/g, '');
  if (cleaned.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(cleaned, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
};

const parseTags = (raw?: string | null) => {
  if (!raw) {
    return [] as string[];
  }

  return raw
    .split(/[,;|]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
};

export const parseInventoryImportCsv = (buffer: Buffer): NormalisedRow[] => {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return records.map((record, index) => {
    const mapped: Partial<InventoryImportRow> & {
      price?: string;
      quantity?: string;
    } = {};

    for (const [header, value] of Object.entries(record)) {
      const key = HEADER_ALIASES[normaliseHeader(header)];
      if (!key) {
        continue;
      }

      if (key === 'price' || key === 'quantity') {
        mapped[key] = value;
        continue;
      }

      mapped[key] = value;
    }

    const rowInput: Record<string, unknown> = {
      brandName: (mapped.brandName ?? '').trim(),
      productName: (mapped.productName ?? '').trim(),
      sku: (mapped.sku ?? '').trim(),
      tags: parseTags(mapped.tags ?? undefined),
    };

    const size = toNullableString(mapped.size ?? undefined);
    if (size) {
      rowInput.size = size;
    }

    const color = toNullableString(mapped.color ?? undefined);
    if (color) {
      rowInput.color = color;
    }

    const barcode = toNullableString(mapped.barcode ?? undefined);
    if (barcode) {
      rowInput.barcode = barcode;
    }

    const priceCents = mapped.priceCents ?? parsePrice(mapped.price ?? undefined);
    if (typeof priceCents === 'number' && Number.isFinite(priceCents)) {
      rowInput.priceCents = priceCents;
    }

    const quantity = parseQuantity(mapped.quantity ?? undefined);
    if (typeof quantity === 'number') {
      rowInput.onHand = quantity;
    }

    const parsedRow = InventoryImportRowSchema.parse(rowInput);

    return {
      ...parsedRow,
      index: index + 1,
    } satisfies NormalisedRow;
  });
};

const toSqlTextArray = (values: string[]) =>
  Prisma.sql`ARRAY[${Prisma.join(
    values.map((value) => Prisma.sql`${value}`),
    Prisma.sql`, `,
  )}]::text[]`;

export type InventoryImportContext = {
  brands: Map<string, ExistingBrand>;
  products: Map<string, ExistingProduct>;
  variants: Map<string, ExistingVariant>;
  variantStocks: Map<string, VariantStockState>;
};

export const loadInventoryImportContext = async (
  prisma: PrismaClient,
  rows: NormalisedRow[],
): Promise<InventoryImportContext> => {
  const brandKeys = Array.from(
    new Set(
      rows.map((row) => row.brandName.trim().toLowerCase()).filter((name) => name.length > 0),
    ),
  );

  const brands = new Map<string, ExistingBrand>();
  if (brandKeys.length > 0) {
    const existingBrands = await prisma.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`
        SELECT "id", "name"
        FROM "Brand"
        WHERE lower("name") = ANY(${toSqlTextArray(brandKeys)})
      `,
    );

    for (const brand of existingBrands) {
      brands.set(brand.name.toLowerCase(), brand);
    }
  }

  const productPairs = rows.map((row) => ({
    brandKey: row.brandName.trim().toLowerCase(),
    productKey: row.productName.trim().toLowerCase(),
  }));

  const productNameSet = Array.from(
    new Set(productPairs.map((pair) => pair.productKey).filter((name) => name.length > 0)),
  );

  const brandIds = Array.from(new Set(Array.from(brands.values()).map((brand) => brand.id)));
  const products = new Map<string, ExistingProduct>();

  if (brandIds.length > 0 && productNameSet.length > 0) {
    const existingProducts = await prisma.$queryRaw<
      Array<{ id: string; brandId: string; name: string }>
    >(
      Prisma.sql`
        SELECT "id", "brandId", "name"
        FROM "Product"
        WHERE "brandId" = ANY(${toSqlTextArray(brandIds)})
          AND lower("name") = ANY(${toSqlTextArray(productNameSet)})
      `,
    );

    for (const product of existingProducts) {
      products.set(`${product.brandId}::${product.name.toLowerCase()}`, product);
    }
  }

  const skuKeys = Array.from(
    new Set(rows.map((row) => row.sku.trim().toLowerCase()).filter((sku) => sku.length > 0)),
  );

  const variants = new Map<string, ExistingVariant>();
  if (skuKeys.length > 0) {
    const existingVariants = await prisma.$queryRaw<
      Array<{
        id: string;
        sku: string;
        productId: string;
        size: string | null;
        color: string | null;
        priceCents: number | null;
        barcode: string | null;
        brandId: string;
        brandName: string;
        productName: string;
      }>
    >(
      Prisma.sql`
        SELECT
          v."id",
          v."sku",
          v."productId",
          v."size",
          v."color",
          v."priceCents",
          v."barcode",
          p."brandId",
          b."name" AS "brandName",
          p."name" AS "productName"
        FROM "Variant" v
        INNER JOIN "Product" p ON p."id" = v."productId"
        INNER JOIN "Brand" b ON b."id" = p."brandId"
        WHERE lower(v."sku") = ANY(${toSqlTextArray(skuKeys)})
      `,
    );

    for (const variant of existingVariants) {
      variants.set(variant.sku.toLowerCase(), {
        id: variant.id,
        sku: variant.sku,
        productId: variant.productId,
        size: variant.size,
        color: variant.color,
        priceCents: variant.priceCents,
        barcode: variant.barcode,
        productName: variant.productName,
        brandId: variant.brandId,
        brandName: variant.brandName,
      });
    }
  }

  const variantIds = Array.from(
    new Set(Array.from(variants.values()).map((variant) => variant.id)),
  );
  const variantStocks = new Map<string, VariantStockState>();

  if (variantIds.length > 0) {
    const stockRows = await prisma.$queryRaw<
      Array<{ variant_id: string; on_hand: bigint | number }>
    >(
      Prisma.sql`
        SELECT variant_id, on_hand
        FROM "current_stock"
        WHERE variant_id = ANY(${toSqlTextArray(variantIds)})
      `,
    );

    for (const row of stockRows) {
      variantStocks.set(row.variant_id, {
        onHand: Number(row.on_hand ?? 0),
        hasInitial: false,
      });
    }

    const ledgerRows = await prisma.$queryRaw<Array<{ variantId: string; hasInitial: boolean }>>(
      Prisma.sql`
        SELECT "variantId", bool_or("type" = 'INITIAL_COUNT') AS "hasInitial"
        FROM "StockLedger"
        WHERE "variantId" = ANY(${toSqlTextArray(variantIds)})
        GROUP BY "variantId"
      `,
    );

    for (const row of ledgerRows) {
      const existing = variantStocks.get(row.variantId) ?? { onHand: 0, hasInitial: false };
      variantStocks.set(row.variantId, {
        onHand: existing.onHand,
        hasInitial: row.hasInitial,
      });
    }
  }

  return {
    brands,
    products,
    variants,
    variantStocks,
  } satisfies InventoryImportContext;
};

type BrandPlan = {
  key: string;
  name: string;
  existing?: ExistingBrand;
  create: boolean;
  createdId?: string;
};

type ProductPlan = {
  key: string;
  brandKey: string;
  name: string;
  existing?: ExistingProduct;
  create: boolean;
  createdId?: string;
};

type VariantPlan = {
  key: string;
  sku: string;
  productKey: string;
  existing?: ExistingVariant;
  create: boolean;
  desired: {
    size?: string;
    color?: string;
    priceCents?: number | null;
    barcode?: string;
  };
};

type DuplicateDetail = {
  sku: string;
  rows: number[];
  message: string;
};

type RowPlan = InventoryImportPreviewRow & {
  brandPlan: BrandPlan;
  productPlan: ProductPlan;
  variantPlan: VariantPlan;
};

export type InventoryImportAnalysis = {
  rows: RowPlan[];
  summary: InventoryImportPreviewSummary;
  brandPlans: Map<string, BrandPlan>;
  productPlans: Map<string, ProductPlan>;
  variantPlans: Map<string, VariantPlan>;
  duplicates: DuplicateDetail[];
};

const createIssue = (
  type: InventoryImportIssue['type'],
  severity: InventoryImportIssueSeverity,
  message: string,
): InventoryImportIssue => ({ type, severity, message });

const rowSignature = (row: InventoryImportRow) =>
  JSON.stringify({
    brand: row.brandName.trim().toLowerCase(),
    product: row.productName.trim().toLowerCase(),
    size: row.size?.toLowerCase() ?? null,
    color: row.color?.toLowerCase() ?? null,
    priceCents: row.priceCents ?? null,
    onHand: row.onHand ?? null,
  });

const toInventoryRow = (row: NormalisedRow): InventoryImportRow => {
  const { index: unusedIndex, ...rest } = row;
  void unusedIndex;
  return rest;
};

export const analyseInventoryImport = (
  rows: NormalisedRow[],
  context: InventoryImportContext,
): InventoryImportAnalysis => {
  const brandPlans = new Map<string, BrandPlan>();
  const productPlans = new Map<string, ProductPlan>();
  const variantPlans = new Map<string, VariantPlan>();
  const duplicates: DuplicateDetail[] = [];
  const duplicateTracker = new Map<string, { signature: string; indexes: number[] }>();
  const previewRows: RowPlan[] = [];

  let blockingIssueCount = 0;
  let variantUpdateCount = 0;
  let priceChangeCount = 0;
  let stockAdjustmentCount = 0;

  for (const row of rows) {
    const issues: InventoryImportIssue[] = [];
    const actions = new Set<InventoryImportAction>();

    const brandKey = row.brandName.trim().toLowerCase();
    const productKey = row.productName.trim().toLowerCase();
    const skuKey = row.sku.trim().toLowerCase();

    if (!brandKey || !productKey || !skuKey) {
      if (!brandKey) {
        issues.push(createIssue('INVALID_FIELD', 'error', 'Brand name is required'));
      }
      if (!productKey) {
        issues.push(createIssue('INVALID_FIELD', 'error', 'Product name is required'));
      }
      if (!skuKey) {
        issues.push(createIssue('INVALID_FIELD', 'error', 'SKU is required'));
      }
    }

    let brandPlan = brandPlans.get(brandKey);
    if (!brandPlan) {
      const existingBrand = context.brands.get(brandKey);
      brandPlan = {
        key: brandKey,
        name: row.brandName.trim(),
        existing: existingBrand,
        create: !existingBrand,
      };
      brandPlans.set(brandKey, brandPlan);
    }

    if (brandPlan.create) {
      actions.add('CREATE_BRAND');
    }

    const productPlanKey = `${brandKey}::${productKey}`;
    let productPlan = productPlans.get(productPlanKey);
    if (!productPlan) {
      const brandId = brandPlan.existing?.id;
      const existingProduct = brandId
        ? context.products.get(`${brandId}::${productKey}`)
        : undefined;

      productPlan = {
        key: productPlanKey,
        brandKey,
        name: row.productName.trim(),
        existing: existingProduct,
        create: !existingProduct,
      };
      productPlans.set(productPlanKey, productPlan);
    }

    if (productPlan.create) {
      actions.add('CREATE_PRODUCT');
    }

    let variantPlan = variantPlans.get(skuKey);
    if (!variantPlan) {
      const existingVariant = context.variants.get(skuKey);
      variantPlan = {
        key: skuKey,
        sku: row.sku.trim(),
        productKey: productPlanKey,
        existing: existingVariant,
        create: !existingVariant,
        desired: {
          size: row.size,
          color: row.color,
          priceCents: row.priceCents ?? null,
          barcode: row.barcode,
        },
      };
      variantPlans.set(skuKey, variantPlan);
    }

    if (variantPlan.productKey !== productPlanKey) {
      issues.push(
        createIssue(
          'DUPLICATE_IN_FILE',
          'error',
          `SKU ${row.sku} appears with conflicting product assignments`,
        ),
      );
    }

    const existingVariant = variantPlan.existing;
    if (existingVariant) {
      if (existingVariant.brandId !== brandPlan.existing?.id) {
        issues.push(
          createIssue(
            'CONFLICTING_RECORD',
            'error',
            `SKU ${row.sku} already belongs to ${existingVariant.brandName} / ${existingVariant.productName}`,
          ),
        );
      }

      if (existingVariant.productId !== productPlan.existing?.id) {
        issues.push(
          createIssue(
            'CONFLICTING_RECORD',
            'error',
            `SKU ${row.sku} is linked to a different product in the catalogue`,
          ),
        );
      }

      const requiresSizeUpdate = row.size && row.size !== existingVariant.size;
      const requiresColorUpdate = row.color && row.color !== existingVariant.color;
      const requiresBarcodeUpdate = row.barcode && row.barcode !== existingVariant.barcode;
      const priceChange =
        typeof row.priceCents === 'number' &&
        row.priceCents !== (existingVariant.priceCents ?? null);

      if (requiresSizeUpdate || requiresColorUpdate || requiresBarcodeUpdate || priceChange) {
        actions.add('UPDATE_VARIANT');
        variantUpdateCount += 1;
      }

      if (priceChange) {
        priceChangeCount += 1;
      }

      if (typeof row.onHand === 'number') {
        const stockState = context.variantStocks.get(existingVariant.id) ?? {
          onHand: 0,
          hasInitial: false,
        };
        const delta = row.onHand - stockState.onHand;
        if (delta !== 0) {
          actions.add('ADJUST_STOCK');
          stockAdjustmentCount += 1;
        }
      }
    } else {
      actions.add('CREATE_VARIANT');
      if (typeof row.onHand === 'number' && row.onHand !== 0) {
        actions.add('ADJUST_STOCK');
        stockAdjustmentCount += 1;
      }
    }

    const duplicate = duplicateTracker.get(skuKey);
    const signature = rowSignature(row);
    if (!duplicate) {
      duplicateTracker.set(skuKey, { signature, indexes: [row.index] });
    } else {
      duplicate.indexes.push(row.index);
      const conflicting = duplicate.signature !== signature;
      const message = conflicting
        ? `Duplicate SKU ${row.sku} has conflicting values across rows ${duplicate.indexes.join(', ')}`
        : `Duplicate SKU ${row.sku} detected in rows ${duplicate.indexes.join(', ')}`;
      duplicates.push({ sku: row.sku, rows: [...duplicate.indexes], message });
      issues.push(createIssue('DUPLICATE_IN_FILE', conflicting ? 'error' : 'warning', message));
      if (conflicting) {
        actions.add('SKIP');
      }
    }

    const blocking = issues.some((issue) => issue.severity === 'error');
    if (blocking) {
      blockingIssueCount += 1;
    }

    previewRows.push({
      index: row.index,
      row: toInventoryRow(row),
      actions: Array.from(actions),
      issues,
      blocking,
      brandPlan,
      productPlan,
      variantPlan,
    });
  }

  const summary: InventoryImportPreviewSummary = {
    totalRows: rows.length,
    create: {
      brands: Array.from(brandPlans.values()).filter((plan) => plan.create).length,
      products: Array.from(productPlans.values()).filter((plan) => plan.create).length,
      variants: Array.from(variantPlans.values()).filter((plan) => plan.create).length,
    },
    update: {
      variants: variantUpdateCount,
      priceChanges: priceChangeCount,
      stockAdjustments: stockAdjustmentCount,
    },
    duplicates,
    blockingIssueCount,
  };

  return {
    rows: previewRows,
    summary,
    brandPlans,
    productPlans,
    variantPlans,
    duplicates,
  } satisfies InventoryImportAnalysis;
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const recordAuditLog = async (
  prisma: PrismaClient | Prisma.TransactionClient,
  batchId: string,
  level: 'INFO' | 'WARN' | 'ERROR',
  message: string,
  metadata?: Record<string, unknown>,
) => {
  await prisma.inventoryImportAuditLog.create({
    data: {
      id: randomUUID(),
      batchId,
      level,
      message,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
    },
  });
};

type ProcessImportOptions = {
  fastify: FastifyInstance;
  batchId: string;
  userId: string;
  chunkSize: number;
  rows: RowPlan[];
  brandPlans: Map<string, BrandPlan>;
  productPlans: Map<string, ProductPlan>;
  variantPlans: Map<string, VariantPlan>;
  variantStocks: Map<string, VariantStockState>;
};

const processRowChunk = async (
  prisma: PrismaClient,
  batchId: string,
  userId: string,
  rows: RowPlan[],
  brandPlans: Map<string, BrandPlan>,
  productPlans: Map<string, ProductPlan>,
  variantPlans: Map<string, VariantPlan>,
  variantStocks: Map<string, VariantStockState>,
) => {
  await prisma.$transaction(async (tx) => {
    for (const rowPlan of rows) {
      if (rowPlan.blocking) {
        await recordAuditLog(
          tx,
          batchId,
          'WARN',
          `Skipped row ${rowPlan.index} due to blocking issues`,
          { sku: rowPlan.row.sku, issues: rowPlan.issues },
        );
        continue;
      }

      const brandPlan = brandPlans.get(rowPlan.brandPlan.key)!;
      const productPlan = productPlans.get(rowPlan.productPlan.key)!;
      const variantPlan = variantPlans.get(rowPlan.variantPlan.key)!;

      let brandId = brandPlan.existing?.id;
      if (!brandId) {
        const createdBrand = await tx.brand.create({
          data: {
            id: randomUUID(),
            name: brandPlan.name,
            updatedAt: new Date(),
          },
        });
        brandPlan.existing = createdBrand;
        brandPlan.createdId = createdBrand.id;
        brandPlan.create = false;
        brandId = createdBrand.id;
        await recordAuditLog(tx, batchId, 'INFO', `Created brand ${createdBrand.name}`, {
          brandId: createdBrand.id,
        });
      }

      let productId = productPlan.existing?.id;
      if (!productId) {
        const createdProduct = await tx.product.create({
          data: {
            id: randomUUID(),
            name: productPlan.name,
            brandId,
            tags: [],
            updatedAt: new Date(),
          },
        });
        productPlan.existing = createdProduct;
        productPlan.createdId = createdProduct.id;
        productPlan.create = false;
        productId = createdProduct.id;
        await recordAuditLog(tx, batchId, 'INFO', `Created product ${createdProduct.name}`, {
          productId: createdProduct.id,
          brandId,
        });
      }

      let variantId = variantPlan.existing?.id;
      if (!variantId) {
        const createdVariant = await tx.variant.create({
          data: {
            id: randomUUID(),
            sku: variantPlan.sku,
            productId,
            size: rowPlan.row.size ?? null,
            color: rowPlan.row.color ?? null,
            priceCents: rowPlan.row.priceCents ?? null,
            barcode: rowPlan.row.barcode ?? null,
            updatedAt: new Date(),
          },
        });
        variantPlan.existing = {
          id: createdVariant.id,
          sku: createdVariant.sku,
          productId: createdVariant.productId,
          size: createdVariant.size,
          color: createdVariant.color,
          priceCents: createdVariant.priceCents,
          barcode: createdVariant.barcode,
          productName: productPlan.name,
          brandId,
          brandName: brandPlan.name,
        };
        variantPlan.create = false;
        variantId = createdVariant.id;
        await recordAuditLog(tx, batchId, 'INFO', `Created variant ${createdVariant.sku}`, {
          variantId: createdVariant.id,
          productId,
        });
      } else {
        const updates: Prisma.VariantUpdateInput = {};
        const existingVariant = variantPlan.existing!;

        if (rowPlan.row.size && rowPlan.row.size !== existingVariant.size) {
          updates.size = rowPlan.row.size;
        }

        if (rowPlan.row.color && rowPlan.row.color !== existingVariant.color) {
          updates.color = rowPlan.row.color;
        }

        if (rowPlan.row.barcode && rowPlan.row.barcode !== existingVariant.barcode) {
          updates.barcode = rowPlan.row.barcode;
        }

        if (
          typeof rowPlan.row.priceCents === 'number' &&
          rowPlan.row.priceCents !== (existingVariant.priceCents ?? null)
        ) {
          updates.priceCents = rowPlan.row.priceCents;
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = new Date();
          const updated = await tx.variant.update({
            where: { id: variantId },
            data: updates,
          });
          variantPlan.existing = {
            ...existingVariant,
            size: updated.size,
            color: updated.color,
            priceCents: updated.priceCents,
            barcode: updated.barcode,
          };
          await recordAuditLog(tx, batchId, 'INFO', `Updated variant ${updated.sku}`, {
            variantId,
            changes: updates,
          });
        }
      }

      if (typeof rowPlan.row.onHand === 'number') {
        const stockState = variantStocks.get(variantId) ?? { onHand: 0, hasInitial: false };
        if (!variantStocks.has(variantId)) {
          variantStocks.set(variantId, stockState);
        }

        if (!stockState.hasInitial) {
          if (rowPlan.row.onHand !== stockState.onHand) {
            const quantity = rowPlan.row.onHand;
            await tx.stockLedger.create({
              data: {
                id: randomUUID(),
                variantId,
                recordedById: userId,
                quantityChange: quantity,
                type: StockLedgerType.INITIAL_COUNT,
                reason: 'Inventory import',
                reference: batchId,
              },
            });
            stockState.hasInitial = true;
            stockState.onHand = quantity;
            await recordAuditLog(tx, batchId, 'INFO', 'Recorded initial stock count', {
              variantId,
              quantity,
            });
          }
        } else {
          const delta = rowPlan.row.onHand - stockState.onHand;
          if (delta !== 0) {
            await tx.stockLedger.create({
              data: {
                id: randomUUID(),
                variantId,
                recordedById: userId,
                quantityChange: delta,
                type: StockLedgerType.ADJUSTMENT,
                reason: 'Inventory import adjustment',
                reference: batchId,
              },
            });
            stockState.onHand += delta;
            await recordAuditLog(tx, batchId, 'INFO', 'Adjusted stock level', {
              variantId,
              delta,
              resultingOnHand: stockState.onHand,
            });
          }
        }
      }
    }
  });
};

export const processInventoryImport = async ({
  fastify,
  batchId,
  userId,
  chunkSize,
  rows,
  brandPlans,
  productPlans,
  variantPlans,
  variantStocks,
}: ProcessImportOptions): Promise<void> => {
  const chunks = chunkArray(rows, chunkSize);
  const prisma = fastify.prisma;

  let processed = 0;

  for (const chunk of chunks) {
    await processRowChunk(
      prisma,
      batchId,
      userId,
      chunk,
      brandPlans,
      productPlans,
      variantPlans,
      variantStocks,
    );
    processed += chunk.length;
    await prisma.inventoryImportBatch.update({
      where: { id: batchId },
      data: { processedRows: processed },
    });
  }
};

export const failInventoryImportBatch = async (
  prisma: PrismaClient,
  batchId: string,
  reason: string,
) => {
  await prisma.inventoryImportBatch.update({
    where: { id: batchId },
    data: {
      status: InventoryImportStatus.FAILED,
      failureReason: reason,
    },
  });
};

export const completeInventoryImportBatch = async (prisma: PrismaClient, batchId: string) => {
  await prisma.inventoryImportBatch.update({
    where: { id: batchId },
    data: {
      status: InventoryImportStatus.COMPLETED,
    },
  });
};
