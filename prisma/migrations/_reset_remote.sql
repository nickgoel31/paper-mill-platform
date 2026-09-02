-- Drops every table so 0001_init.sql (Prisma-generated) can recreate them
-- with the exact column types / affinities the Prisma Client expects.
-- Safe only while the database holds no real data.
DROP TABLE IF EXISTS "AuditLog";
DROP TABLE IF EXISTS "WhatsAppNotification";
DROP TABLE IF EXISTS "InvoiceLine";
DROP TABLE IF EXISTS "Invoice";
DROP TABLE IF EXISTS "Dispatch";
DROP TABLE IF EXISTS "WastageLog";
DROP TABLE IF EXISTS "StockItem";
DROP TABLE IF EXISTS "PatternCut";
DROP TABLE IF EXISTS "CuttingPattern";
DROP TABLE IF EXISTS "ProductionRun";
DROP TABLE IF EXISTS "LoadBatchOrder";
DROP TABLE IF EXISTS "LoadBatch";
DROP TABLE IF EXISTS "OrderItem";
DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS "Truck";
DROP TABLE IF EXISTS "Transporter";
DROP TABLE IF EXISTS "Machine";
DROP TABLE IF EXISTS "StockPreset";
DROP TABLE IF EXISTS "Client";
DROP TABLE IF EXISTS "SystemSetting";
DROP TABLE IF EXISTS "User";
