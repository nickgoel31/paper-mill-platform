-- Client.clientType — groups parties into Dealer / Corrugator / Direct /
-- Retail / Export for the daily order backlog report. Default DEALER keeps
-- every existing row valid; re-tag individual clients from Masters > Clients.
ALTER TABLE "Client" ADD COLUMN "clientType" TEXT NOT NULL DEFAULT 'DEALER';

-- Daily order backlog snapshot — one immutable row per client per day,
-- captured at end-of-day by the /api/cron/daily-order-report cron.
CREATE TABLE "DailyOrderReportLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "reportDate" DATETIME NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientType" TEXT NOT NULL,
    "monthQtyKg" DECIMAL NOT NULL,
    "openingKg" DECIMAL NOT NULL,
    "newOrdersKg" DECIMAL NOT NULL,
    "dispatchedKg" DECIMAL NOT NULL,
    "closingKg" DECIMAL NOT NULL,
    "pendingSizesKg" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyOrderReportLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyOrderReportLine_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailyOrderReportLine_tenantId_reportDate_clientId_key" ON "DailyOrderReportLine"("tenantId", "reportDate", "clientId");
CREATE INDEX "DailyOrderReportLine_tenantId_reportDate_idx" ON "DailyOrderReportLine"("tenantId", "reportDate");
CREATE INDEX "DailyOrderReportLine_clientId_idx" ON "DailyOrderReportLine"("clientId");
