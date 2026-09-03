-- 0004: number of reels (piece count) per order line item. Additive, nullable.

ALTER TABLE "OrderItem" ADD COLUMN "numberOfReels" INTEGER;
