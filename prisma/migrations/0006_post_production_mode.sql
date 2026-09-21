-- Post-production routing.
--   Tenant.postProductionMode : AUTO_DISPATCH (default, reels allocate to their
--                               order on run completion) | INVENTORY (reels are
--                               stored as AVAILABLE and matched to orders manually)
--   StockItem.originOrderItemId: the order item a reel was cut for; used to
--                               suggest a match when the reel sits in inventory.
ALTER TABLE "Tenant"    ADD COLUMN "postProductionMode" TEXT NOT NULL DEFAULT 'AUTO_DISPATCH';
ALTER TABLE "StockItem" ADD COLUMN "originOrderItemId" TEXT;
CREATE INDEX "StockItem_originOrderItemId_idx" ON "StockItem"("originOrderItemId");
