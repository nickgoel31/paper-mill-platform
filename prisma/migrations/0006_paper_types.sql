-- 0006: per-mill, user-managed paper types (replaces the fixed WHITE/BROWN/COLOURED enum).
--
-- Additive + back-fill; safe to run once on live data, and safe to run BEFORE the
-- new code deploys (the old code ignores the new columns and keeps writing the
-- legacy "OrderItem"."paperType" column, which still has its NOT NULL DEFAULT).
--
-- 1. "PaperType" table (one list per tenant).
-- 2. Turn each legacy value actually used by a tenant's order lines into a
--    PaperType row for that tenant (tenants with no orders get an empty list).
-- 3. "paperTypeId" on OrderItem and StockItem, back-filled from the legacy value /
--    from the order line a reel is allocated to.
--
-- The legacy "OrderItem"."paperType" column is intentionally NOT dropped here.
-- Drop it in a later migration once this release is live everywhere.

-- ---------------------------------------------------------------------------
-- 1. PaperType
-- ---------------------------------------------------------------------------
CREATE TABLE "PaperType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "hasColour" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaperType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaperType_tenantId_name_key" ON "PaperType"("tenantId", "name");
CREATE INDEX "PaperType_tenantId_idx" ON "PaperType"("tenantId");

-- ---------------------------------------------------------------------------
-- 2. Seed from legacy values in use
-- ---------------------------------------------------------------------------
INSERT INTO "PaperType" ("id", "tenantId", "name", "hasColour", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
    'ptype_' || o."tenantId" || '_' || lower(oi."paperType"),
    o."tenantId",
    CASE oi."paperType" WHEN 'WHITE' THEN 'White' WHEN 'COLOURED' THEN 'Coloured' ELSE 'Brown (Kraft)' END,
    CASE WHEN oi."paperType" = 'COLOURED' THEN 1 ELSE 0 END,
    1,
    CASE oi."paperType" WHEN 'BROWN' THEN 1 WHEN 'WHITE' THEN 2 ELSE 3 END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "OrderItem" oi
JOIN "Order" o ON o."id" = oi."orderId"
WHERE o."tenantId" IS NOT NULL
GROUP BY o."tenantId", oi."paperType";

-- ---------------------------------------------------------------------------
-- 3. paperTypeId columns + back-fill
-- ---------------------------------------------------------------------------
ALTER TABLE "OrderItem" ADD COLUMN "paperTypeId" TEXT REFERENCES "PaperType" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockItem" ADD COLUMN "paperTypeId" TEXT REFERENCES "PaperType" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "OrderItem"
SET "paperTypeId" = (
    SELECT 'ptype_' || o."tenantId" || '_' || lower("OrderItem"."paperType")
    FROM "Order" o
    WHERE o."id" = "OrderItem"."orderId" AND o."tenantId" IS NOT NULL
)
WHERE EXISTS (
    SELECT 1 FROM "Order" o WHERE o."id" = "OrderItem"."orderId" AND o."tenantId" IS NOT NULL
);

UPDATE "StockItem"
SET "paperTypeId" = (
    SELECT oi."paperTypeId" FROM "OrderItem" oi WHERE oi."id" = "StockItem"."orderItemId"
)
WHERE "orderItemId" IS NOT NULL;

CREATE INDEX "OrderItem_paperTypeId_idx" ON "OrderItem"("paperTypeId");
CREATE INDEX "StockItem_paperTypeId_idx" ON "StockItem"("paperTypeId");
