-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gstin" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxDeckleInch" DECIMAL NOT NULL,
    "minDeckleInch" DECIMAL NOT NULL,
    "minTrimInch" DECIMAL NOT NULL,
    "maxTrimInch" DECIMAL NOT NULL,
    "minGsm" INTEGER NOT NULL,
    "maxGsm" INTEGER NOT NULL,
    "speedMpm" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Machine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transporter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "gstin" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Transporter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationNumber" TEXT NOT NULL,
    "capacityKg" INTEGER NOT NULL,
    "transporterId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Truck_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Truck_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "Transporter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "orderDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryDate" DATETIME,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "widthInch" DECIMAL NOT NULL,
    "gsm" INTEGER NOT NULL,
    "quantityKg" DECIMAL NOT NULL,
    "tolerancePercent" DECIMAL NOT NULL DEFAULT 5.00,
    "ratePerKg" DECIMAL,
    "producedKg" DECIMAL NOT NULL DEFAULT 0,
    "dispatchedKg" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoadBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchNumber" TEXT NOT NULL,
    "truckId" TEXT,
    "transporterId" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "plannedDispatchDate" DATETIME,
    "dispatchedAt" DATETIME,
    "deliveredAt" DATETIME,
    "totalPlannedKg" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "LoadBatch_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LoadBatch_transporterId_fkey" FOREIGN KEY ("transporterId") REFERENCES "Transporter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LoadBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoadBatchOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadBatchId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoadBatchOrder_loadBatchId_fkey" FOREIGN KEY ("loadBatchId") REFERENCES "LoadBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoadBatchOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runNumber" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "gsm" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "plannedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "totalTrimPercent" DECIMAL,
    "totalPlannedKg" DECIMAL NOT NULL DEFAULT 0,
    "totalActualKg" DECIMAL NOT NULL DEFAULT 0,
    "solverPayload" JSONB,
    "aiExplanation" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "ProductionRun_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CuttingPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionRunId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "repetitions" INTEGER NOT NULL,
    "completedRepetitions" INTEGER NOT NULL DEFAULT 0,
    "runLengthM" REAL NOT NULL DEFAULT 0,
    "usedWidthInch" DECIMAL NOT NULL,
    "trimWidthInch" DECIMAL NOT NULL,
    "trimPercent" DECIMAL NOT NULL,
    "estimatedKg" DECIMAL NOT NULL,
    "actualKg" DECIMAL NOT NULL DEFAULT 0,
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CuttingPattern_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PatternCut" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cuttingPatternId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "stockPresetId" TEXT,
    "widthInch" DECIMAL NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PatternCut_cuttingPatternId_fkey" FOREIGN KEY ("cuttingPatternId") REFERENCES "CuttingPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PatternCut_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PatternCut_stockPresetId_fkey" FOREIGN KEY ("stockPresetId") REFERENCES "StockPreset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderItemId" TEXT,
    "productionRunId" TEXT,
    "widthInch" DECIMAL NOT NULL,
    "gsm" INTEGER NOT NULL,
    "quantityKg" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockItem_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WastageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionRunId" TEXT,
    "cuttingPatternId" TEXT,
    "wastageKg" DECIMAL NOT NULL,
    "wastageType" TEXT NOT NULL,
    "reason" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "WastageLog_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WastageLog_cuttingPatternId_fkey" FOREIGN KEY ("cuttingPatternId") REFERENCES "CuttingPattern" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WastageLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispatchNumber" TEXT NOT NULL,
    "loadBatchId" TEXT NOT NULL,
    "dispatchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatePassNumber" TEXT,
    "vehicleNumber" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "totalDispatchedKg" DECIMAL NOT NULL,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Dispatch_loadBatchId_fkey" FOREIGN KEY ("loadBatchId") REFERENCES "LoadBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Dispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "loadBatchId" TEXT,
    "dispatchId" TEXT,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL NOT NULL,
    "cgst" DECIMAL NOT NULL DEFAULT 0,
    "sgst" DECIMAL NOT NULL DEFAULT 0,
    "igst" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_loadBatchId_fkey" FOREIGN KEY ("loadBatchId") REFERENCES "LoadBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantityKg" DECIMAL NOT NULL,
    "ratePerKg" DECIMAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WhatsAppNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadBatchId" TEXT,
    "clientId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppNotification_loadBatchId_fkey" FOREIGN KEY ("loadBatchId") REFERENCES "LoadBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WhatsAppNotification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StockPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "widthInch" DECIMAL NOT NULL,
    "gsm" INTEGER NOT NULL,
    "standardWeightKg" DECIMAL NOT NULL,
    "defaultLocation" TEXT DEFAULT 'BAY-A (Primary Warehouse)',
    "shade" TEXT DEFAULT 'NATURAL',
    "bf" TEXT DEFAULT '18BF',
    "paperType" TEXT DEFAULT 'KRAFT',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "StockPreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE INDEX "Client_code_idx" ON "Client"("code");

-- CreateIndex
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");

-- CreateIndex
CREATE INDEX "Client_city_state_idx" ON "Client"("city", "state");

-- CreateIndex
CREATE INDEX "Client_createdById_idx" ON "Client"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_name_key" ON "Machine"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_code_key" ON "Machine"("code");

-- CreateIndex
CREATE INDEX "Machine_deletedAt_idx" ON "Machine"("deletedAt");

-- CreateIndex
CREATE INDEX "Machine_isActive_idx" ON "Machine"("isActive");

-- CreateIndex
CREATE INDEX "Machine_createdById_idx" ON "Machine"("createdById");

-- CreateIndex
CREATE INDEX "Transporter_deletedAt_idx" ON "Transporter"("deletedAt");

-- CreateIndex
CREATE INDEX "Transporter_createdById_idx" ON "Transporter"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_registrationNumber_key" ON "Truck"("registrationNumber");

-- CreateIndex
CREATE INDEX "Truck_transporterId_idx" ON "Truck"("transporterId");

-- CreateIndex
CREATE INDEX "Truck_deletedAt_idx" ON "Truck"("deletedAt");

-- CreateIndex
CREATE INDEX "Truck_createdById_idx" ON "Truck"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_clientId_idx" ON "Order"("clientId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_priority_idx" ON "Order"("priority");

-- CreateIndex
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

-- CreateIndex
CREATE INDEX "Order_deliveryDate_idx" ON "Order"("deliveryDate");

-- CreateIndex
CREATE INDEX "Order_createdById_idx" ON "Order"("createdById");

-- CreateIndex
CREATE INDEX "OrderItem_gsm_widthInch_idx" ON "OrderItem"("gsm", "widthInch");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadBatch_batchNumber_key" ON "LoadBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "LoadBatch_truckId_idx" ON "LoadBatch"("truckId");

-- CreateIndex
CREATE INDEX "LoadBatch_transporterId_idx" ON "LoadBatch"("transporterId");

-- CreateIndex
CREATE INDEX "LoadBatch_status_idx" ON "LoadBatch"("status");

-- CreateIndex
CREATE INDEX "LoadBatch_plannedDispatchDate_idx" ON "LoadBatch"("plannedDispatchDate");

-- CreateIndex
CREATE INDEX "LoadBatch_createdById_idx" ON "LoadBatch"("createdById");

-- CreateIndex
CREATE INDEX "LoadBatchOrder_loadBatchId_idx" ON "LoadBatchOrder"("loadBatchId");

-- CreateIndex
CREATE INDEX "LoadBatchOrder_orderId_idx" ON "LoadBatchOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadBatchOrder_loadBatchId_orderId_key" ON "LoadBatchOrder"("loadBatchId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRun_runNumber_key" ON "ProductionRun"("runNumber");

-- CreateIndex
CREATE INDEX "ProductionRun_machineId_idx" ON "ProductionRun"("machineId");

-- CreateIndex
CREATE INDEX "ProductionRun_gsm_idx" ON "ProductionRun"("gsm");

-- CreateIndex
CREATE INDEX "ProductionRun_status_idx" ON "ProductionRun"("status");

-- CreateIndex
CREATE INDEX "ProductionRun_plannedDate_idx" ON "ProductionRun"("plannedDate");

-- CreateIndex
CREATE INDEX "ProductionRun_createdById_idx" ON "ProductionRun"("createdById");

-- CreateIndex
CREATE INDEX "CuttingPattern_productionRunId_idx" ON "CuttingPattern"("productionRunId");

-- CreateIndex
CREATE INDEX "CuttingPattern_sequence_idx" ON "CuttingPattern"("sequence");

-- CreateIndex
CREATE INDEX "PatternCut_cuttingPatternId_idx" ON "PatternCut"("cuttingPatternId");

-- CreateIndex
CREATE INDEX "PatternCut_orderItemId_idx" ON "PatternCut"("orderItemId");

-- CreateIndex
CREATE INDEX "PatternCut_stockPresetId_idx" ON "PatternCut"("stockPresetId");

-- CreateIndex
CREATE INDEX "StockItem_status_idx" ON "StockItem"("status");

-- CreateIndex
CREATE INDEX "StockItem_gsm_widthInch_idx" ON "StockItem"("gsm", "widthInch");

-- CreateIndex
CREATE INDEX "StockItem_orderItemId_idx" ON "StockItem"("orderItemId");

-- CreateIndex
CREATE INDEX "StockItem_productionRunId_idx" ON "StockItem"("productionRunId");

-- CreateIndex
CREATE INDEX "WastageLog_productionRunId_idx" ON "WastageLog"("productionRunId");

-- CreateIndex
CREATE INDEX "WastageLog_cuttingPatternId_idx" ON "WastageLog"("cuttingPatternId");

-- CreateIndex
CREATE INDEX "WastageLog_recordedAt_idx" ON "WastageLog"("recordedAt");

-- CreateIndex
CREATE INDEX "WastageLog_wastageType_idx" ON "WastageLog"("wastageType");

-- CreateIndex
CREATE INDEX "WastageLog_createdById_idx" ON "WastageLog"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_dispatchNumber_key" ON "Dispatch"("dispatchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_loadBatchId_key" ON "Dispatch"("loadBatchId");

-- CreateIndex
CREATE INDEX "Dispatch_dispatchedAt_idx" ON "Dispatch"("dispatchedAt");

-- CreateIndex
CREATE INDEX "Dispatch_createdById_idx" ON "Dispatch"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_loadBatchId_key" ON "Invoice"("loadBatchId");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dispatchId_idx" ON "Invoice"("dispatchId");

-- CreateIndex
CREATE INDEX "Invoice_createdById_idx" ON "Invoice"("createdById");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_orderItemId_idx" ON "InvoiceLine"("orderItemId");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_status_idx" ON "WhatsAppNotification"("status");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_clientId_idx" ON "WhatsAppNotification"("clientId");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_loadBatchId_idx" ON "WhatsAppNotification"("loadBatchId");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_createdAt_idx" ON "WhatsAppNotification"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StockPreset_code_key" ON "StockPreset"("code");

-- CreateIndex
CREATE INDEX "StockPreset_gsm_widthInch_idx" ON "StockPreset"("gsm", "widthInch");

-- CreateIndex
CREATE INDEX "StockPreset_isActive_idx" ON "StockPreset"("isActive");

-- CreateIndex
CREATE INDEX "StockPreset_deletedAt_idx" ON "StockPreset"("deletedAt");

-- CreateIndex
CREATE INDEX "StockPreset_createdById_idx" ON "StockPreset"("createdById");

