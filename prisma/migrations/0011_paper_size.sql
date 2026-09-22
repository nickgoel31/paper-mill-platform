-- Hardcoded reel size category (Baby / Normal), same additive pattern as
-- migration 0006 (PaperType). Default NORMAL keeps every existing row valid.
ALTER TABLE "OrderItem" ADD COLUMN "paperSize" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "StockItem" ADD COLUMN "paperSize" TEXT NOT NULL DEFAULT 'NORMAL';
