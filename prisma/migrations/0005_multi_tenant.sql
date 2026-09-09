-- 0005: multi-tenant. Additive + backfill; safe to run once on live data.
--
-- 1. New Tenant table + the "HRA Paper Mill" tenant that owns all current data.
-- 2. tenantId column on every business table + User, back-filled to HRA.
-- 3. Per-tenant composite unique indexes (drop the old global ones).
-- 4. tenantId indexes.
-- 5. The TWJ-Labs platform super-admin (tenantId = NULL).

-- ---------------------------------------------------------------------------
-- 1. Tenant
-- ---------------------------------------------------------------------------
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

INSERT INTO "Tenant" ("id","name","slug","code","isActive","createdAt","updatedAt")
VALUES ('tnt_hra','HRA Paper Mill','hra','HRA',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------------
-- 2. tenantId columns + back-fill
-- ---------------------------------------------------------------------------
ALTER TABLE "User"                 ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Client"               ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Machine"              ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Transporter"          ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Truck"                ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StockPreset"          ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Order"                ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ProductionRun"        ADD COLUMN "tenantId" TEXT;
ALTER TABLE "LoadBatch"            ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Dispatch"             ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Invoice"              ADD COLUMN "tenantId" TEXT;
ALTER TABLE "StockItem"            ADD COLUMN "tenantId" TEXT;
ALTER TABLE "WastageLog"           ADD COLUMN "tenantId" TEXT;
ALTER TABLE "WhatsAppNotification" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog"             ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SystemSetting"        ADD COLUMN "tenantId" TEXT;

UPDATE "User"                 SET "tenantId" = 'tnt_hra';
UPDATE "Client"               SET "tenantId" = 'tnt_hra';
UPDATE "Machine"              SET "tenantId" = 'tnt_hra';
UPDATE "Transporter"          SET "tenantId" = 'tnt_hra';
UPDATE "Truck"                SET "tenantId" = 'tnt_hra';
UPDATE "StockPreset"          SET "tenantId" = 'tnt_hra';
UPDATE "Order"                SET "tenantId" = 'tnt_hra';
UPDATE "ProductionRun"        SET "tenantId" = 'tnt_hra';
UPDATE "LoadBatch"            SET "tenantId" = 'tnt_hra';
UPDATE "Dispatch"             SET "tenantId" = 'tnt_hra';
UPDATE "Invoice"              SET "tenantId" = 'tnt_hra';
UPDATE "StockItem"            SET "tenantId" = 'tnt_hra';
UPDATE "WastageLog"           SET "tenantId" = 'tnt_hra';
UPDATE "WhatsAppNotification" SET "tenantId" = 'tnt_hra';
UPDATE "AuditLog"             SET "tenantId" = 'tnt_hra';
UPDATE "SystemSetting"        SET "tenantId" = 'tnt_hra';

-- ---------------------------------------------------------------------------
-- 3. Global unique -> per-tenant composite unique
-- ---------------------------------------------------------------------------
DROP INDEX "Client_code_key";
CREATE UNIQUE INDEX "Client_tenantId_code_key" ON "Client"("tenantId","code");

DROP INDEX "Machine_name_key";
CREATE UNIQUE INDEX "Machine_tenantId_name_key" ON "Machine"("tenantId","name");
DROP INDEX "Machine_code_key";
CREATE UNIQUE INDEX "Machine_tenantId_code_key" ON "Machine"("tenantId","code");

DROP INDEX "Truck_registrationNumber_key";
CREATE UNIQUE INDEX "Truck_tenantId_registrationNumber_key" ON "Truck"("tenantId","registrationNumber");

DROP INDEX "Order_orderNumber_key";
CREATE UNIQUE INDEX "Order_tenantId_orderNumber_key" ON "Order"("tenantId","orderNumber");

DROP INDEX "LoadBatch_batchNumber_key";
CREATE UNIQUE INDEX "LoadBatch_tenantId_batchNumber_key" ON "LoadBatch"("tenantId","batchNumber");

DROP INDEX "ProductionRun_runNumber_key";
CREATE UNIQUE INDEX "ProductionRun_tenantId_runNumber_key" ON "ProductionRun"("tenantId","runNumber");

DROP INDEX "Dispatch_dispatchNumber_key";
CREATE UNIQUE INDEX "Dispatch_tenantId_dispatchNumber_key" ON "Dispatch"("tenantId","dispatchNumber");

DROP INDEX "Invoice_invoiceNumber_key";
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId","invoiceNumber");

DROP INDEX "SystemSetting_key_key";
CREATE UNIQUE INDEX "SystemSetting_tenantId_key_key" ON "SystemSetting"("tenantId","key");

DROP INDEX "StockPreset_code_key";
CREATE UNIQUE INDEX "StockPreset_tenantId_code_key" ON "StockPreset"("tenantId","code");

-- ---------------------------------------------------------------------------
-- 4. tenantId indexes
-- ---------------------------------------------------------------------------
CREATE INDEX "User_tenantId_idx"                 ON "User"("tenantId");
CREATE INDEX "Client_tenantId_idx"               ON "Client"("tenantId");
CREATE INDEX "Machine_tenantId_idx"              ON "Machine"("tenantId");
CREATE INDEX "Transporter_tenantId_idx"          ON "Transporter"("tenantId");
CREATE INDEX "Truck_tenantId_idx"                ON "Truck"("tenantId");
CREATE INDEX "StockPreset_tenantId_idx"          ON "StockPreset"("tenantId");
CREATE INDEX "Order_tenantId_idx"                ON "Order"("tenantId");
CREATE INDEX "ProductionRun_tenantId_idx"        ON "ProductionRun"("tenantId");
CREATE INDEX "LoadBatch_tenantId_idx"            ON "LoadBatch"("tenantId");
CREATE INDEX "Dispatch_tenantId_idx"             ON "Dispatch"("tenantId");
CREATE INDEX "Invoice_tenantId_idx"              ON "Invoice"("tenantId");
CREATE INDEX "StockItem_tenantId_idx"            ON "StockItem"("tenantId");
CREATE INDEX "WastageLog_tenantId_idx"           ON "WastageLog"("tenantId");
CREATE INDEX "WhatsAppNotification_tenantId_idx" ON "WhatsAppNotification"("tenantId");
CREATE INDEX "AuditLog_tenantId_idx"             ON "AuditLog"("tenantId");
CREATE INDEX "SystemSetting_tenantId_idx"        ON "SystemSetting"("tenantId");

-- ---------------------------------------------------------------------------
-- 5. Platform super-admin (TWJ Labs). Password: twjadmin2026 — change on first login.
-- ---------------------------------------------------------------------------
INSERT INTO "User" ("id","name","email","passwordHash","role","isActive","tenantId","createdAt","updatedAt")
VALUES (
  'usr_twj_platform_admin',
  'TWJ Labs Admin',
  'admin@twjlabs.com',
  '$2a$10$L7FmMpvvheHToZ32kOpHfO4tDhsH1bjhSRpWPeho8NrLpk4VtRPQa',
  'ADMIN',
  true,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
