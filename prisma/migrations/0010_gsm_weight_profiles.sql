-- 0010: per-mill GSM weight chart (kg per inch of width for a standard finished
-- reel at that GSM, plus an informational reel diameter). New table only —
-- nothing existing changes.

CREATE TABLE "GsmWeightProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "gsm" INTEGER NOT NULL,
    "kgPerInch" DECIMAL NOT NULL,
    "reelDiameterInch" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "GsmWeightProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GsmWeightProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GsmWeightProfile_tenantId_gsm_key" ON "GsmWeightProfile"("tenantId", "gsm");
CREATE INDEX "GsmWeightProfile_tenantId_idx" ON "GsmWeightProfile"("tenantId");
