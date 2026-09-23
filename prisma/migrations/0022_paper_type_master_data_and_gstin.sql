CREATE TABLE "PaperTypeOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "PaperTypeOption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaperTypeOption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaperTypeOption_tenantId_name_key" ON "PaperTypeOption"("tenantId", "name");
CREATE INDEX "PaperTypeOption_tenantId_idx" ON "PaperTypeOption"("tenantId");

-- Seed every existing tenant with the two paper types that were previously
-- the fixed enum, so existing Order/Stock rows (which already store these
-- exact strings) keep matching master-data entries.
INSERT INTO "PaperTypeOption" ("id", "tenantId", "name", "label")
SELECT lower(hex(randomblob(16))), t."id", 'NATURAL', 'Natural' FROM "Tenant" t;

INSERT INTO "PaperTypeOption" ("id", "tenantId", "name", "label")
SELECT lower(hex(randomblob(16))), t."id", 'BY', 'BY' FROM "Tenant" t;
