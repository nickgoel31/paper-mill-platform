-- Burst Factor (BF) — a paper-quality spec the mill records for commercial/
-- display purposes on sales order lines and warehouse reels. Deliberately NOT
-- used anywhere in the deckle solver or stock-matching logic. Default 18
-- (the mill's most common grade) keeps every existing row valid.
ALTER TABLE "OrderItem" ADD COLUMN "bf" INTEGER NOT NULL DEFAULT 18;
ALTER TABLE "StockItem" ADD COLUMN "bf" INTEGER NOT NULL DEFAULT 18;
