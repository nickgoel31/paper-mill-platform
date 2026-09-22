ALTER TABLE "InvoiceLine" ADD COLUMN "hsnCode" TEXT NOT NULL DEFAULT '4804';

ALTER TABLE "Invoice" ADD COLUMN "dueDate" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "irn" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ackNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "ackDate" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "qrCodeData" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "einvoiceStatus" TEXT NOT NULL DEFAULT 'NOT_GENERATED';

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT,
  "invoiceId" TEXT NOT NULL,
  "amount" DECIMAL NOT NULL,
  "paymentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  "referenceNumber" TEXT,
  "notes" TEXT,
  "recordedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");
