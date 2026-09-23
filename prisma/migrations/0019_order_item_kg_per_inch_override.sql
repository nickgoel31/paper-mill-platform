-- Per-order-line override of the mill's GsmWeightProfile kg/inch chart — a
-- specific party's paper for a GSM can be calibrated differently than the
-- mill's general default. NULL (the default for every existing row) means
-- "use the mill's chart", so this is purely additive and changes nothing
-- until a mill actually sets one.
ALTER TABLE "OrderItem" ADD COLUMN "kgPerInchOverride" DECIMAL;
