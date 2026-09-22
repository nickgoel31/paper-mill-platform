-- 0009: human-facing reel number on StockItem ("REEL-2609-0001"), additive.
-- Existing reels are left with no reelNumber (nothing to backfill sensibly —
-- new ones get one going forward).

ALTER TABLE "StockItem" ADD COLUMN "reelNumber" TEXT;
