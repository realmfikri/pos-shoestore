-- CreateEnum
CREATE TYPE "InventoryImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "InventoryImportBatch" (
    "id" TEXT NOT NULL,
    "status" "InventoryImportStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "chunkSize" INTEGER NOT NULL DEFAULT 200,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryImportAuditLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryImportAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryImportBatch_uploadedById_idx" ON "InventoryImportBatch"("uploadedById");

-- CreateIndex
CREATE INDEX "InventoryImportAuditLog_batchId_idx" ON "InventoryImportAuditLog"("batchId");

-- AddForeignKey
ALTER TABLE "InventoryImportBatch" ADD CONSTRAINT "InventoryImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryImportAuditLog" ADD CONSTRAINT "InventoryImportAuditLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
