-- Machine.trimMode: where a machine's edge trim falls on the web.
--   BOTH_SIDES (default): trim is split evenly between the two edges
--                         (e.g. 1" total = 0.5" per side)
--   ONE_SIDE            : all trim falls on a single edge
-- The solver still works on the machine's TOTAL trim; this only affects how
-- patterns are drawn and how the trim is described.
ALTER TABLE "Machine" ADD COLUMN "trimMode" TEXT NOT NULL DEFAULT 'BOTH_SIDES';
