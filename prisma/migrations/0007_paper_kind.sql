-- 0007: paper type is now a fixed choice - NATURAL or BY - on both sales-order
-- lines and stock reels.
--
-- Purely additive, safe to run BEFORE the new code deploys: the new value lives in
-- a NEW column ("paperKind"), so the old fixed White/Brown/Coloured column
-- ("OrderItem"."paperType") is left completely untouched and the currently-live
-- code keeps working. Every existing order line and reel becomes NATURAL (the old
-- default, BROWN/kraft, is natural paper).
--
-- Left in place, unused (from the abandoned dynamic-list attempt, 0006): the
-- "PaperType" table and "OrderItem"/"StockItem"."paperTypeId". Dropping them would
-- need table rebuilds; they are harmless.

ALTER TABLE "OrderItem" ADD COLUMN "paperKind" TEXT NOT NULL DEFAULT 'NATURAL';
ALTER TABLE "StockItem" ADD COLUMN "paperKind" TEXT NOT NULL DEFAULT 'NATURAL';
