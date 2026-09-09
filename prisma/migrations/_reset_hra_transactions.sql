-- Reset HRA Paper Mill's transactional data. Keeps masters (Client, Machine,
-- Truck, Transporter, StockPreset), the Tenant row, Users and SystemSettings.
-- Deletes: orders, production, deckle patterns, stock reels, logistics, invoices,
-- wastage, notifications and the audit trail — all scoped to tenantId 'tnt_hra'.
--
-- Run:  cd apps/web
--       npx wrangler d1 execute DB --remote --file "F:\BUSINESS\TWJ LABS\Clients\HRA Paper Mill\erp-final\prisma\migrations\_reset_hra_transactions.sql"
-- (add --local for the dev database)

-- leaf children first
DELETE FROM "PatternCut"
  WHERE "cuttingPatternId" IN (
    SELECT cp."id" FROM "CuttingPattern" cp
    JOIN "ProductionRun" pr ON pr."id" = cp."productionRunId"
    WHERE pr."tenantId" = 'tnt_hra'
  );

DELETE FROM "InvoiceLine"
  WHERE "invoiceId" IN (SELECT "id" FROM "Invoice" WHERE "tenantId" = 'tnt_hra');

DELETE FROM "LoadBatchOrder"
  WHERE "loadBatchId" IN (SELECT "id" FROM "LoadBatch" WHERE "tenantId" = 'tnt_hra')
     OR "orderId"     IN (SELECT "id" FROM "Order"     WHERE "tenantId" = 'tnt_hra');

DELETE FROM "CuttingPattern"
  WHERE "productionRunId" IN (SELECT "id" FROM "ProductionRun" WHERE "tenantId" = 'tnt_hra');

DELETE FROM "OrderItem"
  WHERE "orderId" IN (SELECT "id" FROM "Order" WHERE "tenantId" = 'tnt_hra');

-- tenant-scoped rows
DELETE FROM "WastageLog"           WHERE "tenantId" = 'tnt_hra';
DELETE FROM "StockItem"            WHERE "tenantId" = 'tnt_hra';
DELETE FROM "WhatsAppNotification" WHERE "tenantId" = 'tnt_hra';
DELETE FROM "Invoice"              WHERE "tenantId" = 'tnt_hra';
DELETE FROM "Dispatch"             WHERE "tenantId" = 'tnt_hra';
DELETE FROM "ProductionRun"        WHERE "tenantId" = 'tnt_hra';
DELETE FROM "LoadBatch"            WHERE "tenantId" = 'tnt_hra';
DELETE FROM "Order"                WHERE "tenantId" = 'tnt_hra';
DELETE FROM "AuditLog"             WHERE "tenantId" = 'tnt_hra';
