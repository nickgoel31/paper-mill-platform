-- HRA Paper Mill ERP â€” D1 SQLite Schema Migration
-- Generated for Cloudflare D1 (SQLite-compatible)
-- All Decimal types become REAL, @db.Text becomes TEXT

-- Enums stored as TEXT with CHECK constraints

CREATE TABLE IF NOT EXISTS "User" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "email"        TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "role"         TEXT NOT NULL CHECK("role" IN ('ADMIN','SALES','PLANNER','OPERATOR','DISPATCH')),
  "isActive"     INTEGER NOT NULL DEFAULT 1,
  "createdAt"    TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Client" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "code"          TEXT NOT NULL UNIQUE,
  "gstin"         TEXT,
  "addressLine1"  TEXT NOT NULL,
  "addressLine2"  TEXT,
  "city"          TEXT NOT NULL,
  "state"         TEXT NOT NULL,
  "pincode"       TEXT NOT NULL,
  "contactPerson" TEXT,
  "phone"         TEXT NOT NULL,
  "whatsappNumber" TEXT NOT NULL,
  "email"         TEXT,
  "isActive"      INTEGER NOT NULL DEFAULT 1,
  "deletedAt"     TEXT,
  "createdAt"     TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"     TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"   TEXT REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "Client_code_idx" ON "Client"("code");
CREATE INDEX IF NOT EXISTS "Client_deletedAt_idx" ON "Client"("deletedAt");

CREATE TABLE IF NOT EXISTS "Machine" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "name"          TEXT NOT NULL UNIQUE,
  "code"          TEXT NOT NULL UNIQUE,
  "maxDeckleInch" REAL NOT NULL,
  "minDeckleInch" REAL NOT NULL,
  "minTrimInch"   REAL NOT NULL,
  "maxTrimInch"   REAL NOT NULL,
  "minGsm"        INTEGER NOT NULL,
  "maxGsm"        INTEGER NOT NULL,
  "speedMpm"      INTEGER,
  "isActive"      INTEGER NOT NULL DEFAULT 1,
  "deletedAt"     TEXT,
  "createdAt"     TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"     TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"   TEXT REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "Machine_deletedAt_idx" ON "Machine"("deletedAt");
CREATE INDEX IF NOT EXISTS "Machine_isActive_idx" ON "Machine"("isActive");

CREATE TABLE IF NOT EXISTS "Transporter" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "phone"       TEXT NOT NULL,
  "gstin"       TEXT,
  "isActive"    INTEGER NOT NULL DEFAULT 1,
  "deletedAt"   TEXT,
  "createdAt"   TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"   TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "Truck" (
  "id"                 TEXT NOT NULL PRIMARY KEY,
  "registrationNumber" TEXT NOT NULL UNIQUE,
  "capacityKg"         INTEGER NOT NULL,
  "transporterId"      TEXT REFERENCES "Transporter"("id") ON DELETE SET NULL,
  "isActive"           INTEGER NOT NULL DEFAULT 1,
  "deletedAt"          TEXT,
  "createdAt"          TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"          TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"        TEXT REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "Order" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "orderNumber"  TEXT NOT NULL UNIQUE,
  "clientId"     TEXT NOT NULL REFERENCES "Client"("id"),
  "orderDate"    TEXT NOT NULL DEFAULT (datetime('now')),
  "deliveryDate" TEXT,
  "priority"     TEXT NOT NULL DEFAULT 'NORMAL' CHECK("priority" IN ('URGENT','NORMAL','STOCK')),
  "status"       TEXT NOT NULL DEFAULT 'DRAFT' CHECK("status" IN ('DRAFT','CONFIRMED','PLANNED','IN_PRODUCTION','PRODUCED','DISPATCHED','CANCELLED')),
  "notes"        TEXT,
  "createdAt"    TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"    TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"  TEXT REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "Order_clientId_idx" ON "Order"("clientId");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_priority_idx" ON "Order"("priority");

CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "orderId"          TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "widthInch"        REAL NOT NULL,
  "gsm"              INTEGER NOT NULL,
  "quantityKg"       REAL NOT NULL,
  "tolerancePercent" REAL NOT NULL DEFAULT 5.0,
  "ratePerKg"        REAL,
  "producedKg"       REAL NOT NULL DEFAULT 0,
  "dispatchedKg"     REAL NOT NULL DEFAULT 0,
  "createdAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_gsm_widthInch_idx" ON "OrderItem"("gsm","widthInch");

CREATE TABLE IF NOT EXISTS "LoadBatch" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "batchNumber"         TEXT NOT NULL UNIQUE,
  "truckId"             TEXT REFERENCES "Truck"("id") ON DELETE SET NULL,
  "transporterId"       TEXT REFERENCES "Transporter"("id") ON DELETE SET NULL,
  "driverName"          TEXT,
  "driverPhone"         TEXT,
  "status"              TEXT NOT NULL DEFAULT 'DRAFT' CHECK("status" IN ('DRAFT','PLANNED','LOADING','DISPATCHED','DELIVERED','CANCELLED')),
  "plannedDispatchDate" TEXT,
  "dispatchedAt"        TEXT,
  "deliveredAt"         TEXT,
  "totalPlannedKg"      REAL NOT NULL DEFAULT 0,
  "notes"               TEXT,
  "createdAt"           TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"           TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"         TEXT REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "LoadBatch_status_idx" ON "LoadBatch"("status");

CREATE TABLE IF NOT EXISTS "LoadBatchOrder" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "loadBatchId" TEXT NOT NULL REFERENCES "LoadBatch"("id") ON DELETE CASCADE,
  "orderId"     TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "createdAt"   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE("loadBatchId","orderId")
);

CREATE TABLE IF NOT EXISTS "ProductionRun" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "runNumber"        TEXT NOT NULL UNIQUE,
  "machineId"        TEXT NOT NULL REFERENCES "Machine"("id"),
  "gsm"              INTEGER NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'PLANNED' CHECK("status" IN ('PLANNED','RELEASED','RUNNING','COMPLETED','CANCELLED')),
  "plannedDate"      TEXT NOT NULL DEFAULT (datetime('now')),
  "startedAt"        TEXT,
  "completedAt"      TEXT,
  "totalTrimPercent" REAL,
  "totalPlannedKg"   REAL NOT NULL DEFAULT 0,
  "totalActualKg"    REAL NOT NULL DEFAULT 0,
  "solverPayload"    TEXT,
  "aiExplanation"    TEXT,
  "notes"            TEXT,
  "createdAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"      TEXT REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "ProductionRun_machineId_idx" ON "ProductionRun"("machineId");
CREATE INDEX IF NOT EXISTS "ProductionRun_status_idx" ON "ProductionRun"("status");
CREATE INDEX IF NOT EXISTS "ProductionRun_gsm_idx" ON "ProductionRun"("gsm");

CREATE TABLE IF NOT EXISTS "CuttingPattern" (
  "id"                   TEXT NOT NULL PRIMARY KEY,
  "productionRunId"      TEXT NOT NULL REFERENCES "ProductionRun"("id") ON DELETE CASCADE,
  "sequence"             INTEGER NOT NULL,
  "repetitions"          INTEGER NOT NULL,
  "completedRepetitions" INTEGER NOT NULL DEFAULT 0,
  "runLengthM"           REAL NOT NULL DEFAULT 0,
  "usedWidthInch"        REAL NOT NULL,
  "trimWidthInch"        REAL NOT NULL,
  "trimPercent"          REAL NOT NULL,
  "estimatedKg"          REAL NOT NULL,
  "actualKg"             REAL NOT NULL DEFAULT 0,
  "isManuallyEdited"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"            TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "CuttingPattern_productionRunId_idx" ON "CuttingPattern"("productionRunId");

CREATE TABLE IF NOT EXISTS "PatternCut" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "cuttingPatternId" TEXT NOT NULL REFERENCES "CuttingPattern"("id") ON DELETE CASCADE,
  "orderItemId"      TEXT REFERENCES "OrderItem"("id") ON DELETE CASCADE,
  "stockPresetId"    TEXT,
  "widthInch"        REAL NOT NULL,
  "count"            INTEGER NOT NULL,
  "createdAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "PatternCut_cuttingPatternId_idx" ON "PatternCut"("cuttingPatternId");
CREATE INDEX IF NOT EXISTS "PatternCut_orderItemId_idx" ON "PatternCut"("orderItemId");

CREATE TABLE IF NOT EXISTS "StockItem" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "orderItemId"     TEXT REFERENCES "OrderItem"("id") ON DELETE SET NULL,
  "productionRunId" TEXT REFERENCES "ProductionRun"("id") ON DELETE SET NULL,
  "widthInch"       REAL NOT NULL,
  "gsm"             INTEGER NOT NULL,
  "quantityKg"      REAL NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK("status" IN ('AVAILABLE','ALLOCATED','DISPATCHED')),
  "location"        TEXT,
  "createdAt"       TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "StockItem_status_idx" ON "StockItem"("status");
CREATE INDEX IF NOT EXISTS "StockItem_gsm_widthInch_idx" ON "StockItem"("gsm","widthInch");

CREATE TABLE IF NOT EXISTS "WastageLog" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "productionRunId"  TEXT REFERENCES "ProductionRun"("id") ON DELETE SET NULL,
  "cuttingPatternId" TEXT REFERENCES "CuttingPattern"("id") ON DELETE SET NULL,
  "wastageKg"        REAL NOT NULL,
  "wastageType"      TEXT NOT NULL,
  "reason"           TEXT,
  "recordedAt"       TEXT NOT NULL DEFAULT (datetime('now')),
  "createdAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"      TEXT REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "Dispatch" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "dispatchNumber"    TEXT NOT NULL UNIQUE,
  "loadBatchId"       TEXT NOT NULL UNIQUE REFERENCES "LoadBatch"("id"),
  "dispatchedAt"      TEXT NOT NULL DEFAULT (datetime('now')),
  "gatePassNumber"    TEXT,
  "vehicleNumber"     TEXT NOT NULL,
  "driverName"        TEXT NOT NULL,
  "driverPhone"       TEXT NOT NULL,
  "totalDispatchedKg" REAL NOT NULL,
  "remarks"           TEXT,
  "createdAt"         TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"         TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"       TEXT REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "invoiceNumber" TEXT NOT NULL UNIQUE,
  "clientId"      TEXT NOT NULL REFERENCES "Client"("id"),
  "loadBatchId"   TEXT UNIQUE REFERENCES "LoadBatch"("id"),
  "dispatchId"    TEXT REFERENCES "Dispatch"("id"),
  "invoiceDate"   TEXT NOT NULL DEFAULT (datetime('now')),
  "subtotal"      REAL NOT NULL,
  "cgst"          REAL NOT NULL DEFAULT 0,
  "sgst"          REAL NOT NULL DEFAULT 0,
  "igst"          REAL NOT NULL DEFAULT 0,
  "totalAmount"   REAL NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'DRAFT' CHECK("status" IN ('DRAFT','ISSUED','CANCELLED')),
  "pdfUrl"        TEXT,
  "createdAt"     TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"     TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"   TEXT REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "Invoice_clientId_idx" ON "Invoice"("clientId");
CREATE INDEX IF NOT EXISTS "Invoice_status_idx" ON "Invoice"("status");

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "invoiceId"   TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "orderItemId" TEXT REFERENCES "OrderItem"("id") ON DELETE SET NULL,
  "description" TEXT NOT NULL,
  "quantityKg"  REAL NOT NULL,
  "ratePerKg"   REAL NOT NULL,
  "amount"      REAL NOT NULL,
  "createdAt"   TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "WhatsAppNotification" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "loadBatchId"       TEXT REFERENCES "LoadBatch"("id") ON DELETE SET NULL,
  "clientId"          TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE,
  "phoneNumber"       TEXT NOT NULL,
  "templateName"      TEXT NOT NULL,
  "payload"           TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'QUEUED' CHECK("status" IN ('QUEUED','SENT','FAILED')),
  "providerMessageId" TEXT,
  "errorMessage"      TEXT,
  "attempts"          INTEGER NOT NULL DEFAULT 0,
  "sentAt"            TEXT,
  "createdAt"         TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "userId"     TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "entityType" TEXT NOT NULL,
  "entityId"   TEXT NOT NULL,
  "action"     TEXT NOT NULL,
  "before"     TEXT,
  "after"      TEXT,
  "createdAt"  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType","entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");

CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "key"         TEXT NOT NULL UNIQUE,
  "value"       TEXT NOT NULL,
  "description" TEXT,
  "updatedAt"   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS "StockPreset" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "code"             TEXT NOT NULL UNIQUE,
  "widthInch"        REAL NOT NULL,
  "gsm"              INTEGER NOT NULL,
  "standardWeightKg" REAL NOT NULL,
  "defaultLocation"  TEXT DEFAULT 'BAY-A (Primary Warehouse)',
  "shade"            TEXT DEFAULT 'NATURAL',
  "bf"               TEXT DEFAULT '18BF',
  "paperType"        TEXT DEFAULT 'KRAFT',
  "description"      TEXT,
  "isActive"         INTEGER NOT NULL DEFAULT 1,
  "deletedAt"        TEXT,
  "createdAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"        TEXT NOT NULL DEFAULT (datetime('now')),
  "createdById"      TEXT REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "StockPreset_gsm_widthInch_idx" ON "StockPreset"("gsm","widthInch");
CREATE INDEX IF NOT EXISTS "StockPreset_isActive_idx" ON "StockPreset"("isActive");

-- Add foreign key from PatternCut to StockPreset (must be after both tables created)
-- SQLite does not support ADD CONSTRAINT, so this is handled via the initial CREATE TABLE above