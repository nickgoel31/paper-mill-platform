-- 0003: paper type + colour + remark on order line items, and an order-level
-- "other notes" field. All additive; safe to run on a populated database.

ALTER TABLE "OrderItem" ADD COLUMN "paperType" TEXT NOT NULL DEFAULT 'BROWN';
ALTER TABLE "OrderItem" ADD COLUMN "paperColour" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "remark" TEXT;

ALTER TABLE "Order" ADD COLUMN "otherNotes" TEXT;
