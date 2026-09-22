-- 0008: cm/inch support. Purely additive.
--
-- "widthInch" / "maxDeckleInch" / "minDeckleInch" / "minTrimInch" / "maxTrimInch"
-- keep meaning exactly what they always meant (canonical inches) - every existing
-- comparison, the deckle solver, and stock-to-order matching are untouched and
-- keep working unmodified. The new columns only record which unit a value was
-- entered in, and (for OrderItem/StockItem, where exact-match matters) the raw
-- number as typed, so redisplaying "as entered" never drifts from rounding.
--
-- All existing data was entered in inches, so every backfill below is 'INCH'.

ALTER TABLE "OrderItem" ADD COLUMN "enteredWidth" DECIMAL;
ALTER TABLE "OrderItem" ADD COLUMN "enteredWidthUnit" TEXT NOT NULL DEFAULT 'INCH';
UPDATE "OrderItem" SET "enteredWidth" = "widthInch";

ALTER TABLE "StockItem" ADD COLUMN "enteredWidth" DECIMAL;
ALTER TABLE "StockItem" ADD COLUMN "enteredWidthUnit" TEXT NOT NULL DEFAULT 'INCH';
UPDATE "StockItem" SET "enteredWidth" = "widthInch";

ALTER TABLE "Machine" ADD COLUMN "dimensionUnit" TEXT NOT NULL DEFAULT 'INCH';
ALTER TABLE "StockPreset" ADD COLUMN "dimensionUnit" TEXT NOT NULL DEFAULT 'INCH';
