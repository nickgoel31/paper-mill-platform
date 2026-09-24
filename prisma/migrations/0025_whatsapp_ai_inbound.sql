-- Registers which WhatsApp numbers may trigger the AI assistant (order
-- creation, report delivery) for a given mill, and which existing staff user
-- each number acts as (so normal role permissions still apply).
CREATE TABLE "WhatsAppAllowedSender" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "label" TEXT,
    "actAsUserId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "WhatsAppAllowedSender_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WhatsAppAllowedSender_actAsUserId_fkey" FOREIGN KEY ("actAsUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WhatsAppAllowedSender_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsAppAllowedSender_phoneNumber_key" ON "WhatsAppAllowedSender"("phoneNumber");
CREATE INDEX "WhatsAppAllowedSender_tenantId_idx" ON "WhatsAppAllowedSender"("tenantId");
CREATE INDEX "WhatsAppAllowedSender_actAsUserId_idx" ON "WhatsAppAllowedSender"("actAsUserId");

-- One row per inbound WhatsApp message, for idempotency (Meta redelivers
-- webhook events) and an audit trail of what the AI did in response.
CREATE TABLE "WhatsAppInboundMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "waMessageId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "rawText" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "replyText" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppInboundMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WhatsAppInboundMessage_waMessageId_key" ON "WhatsAppInboundMessage"("waMessageId");
CREATE INDEX "WhatsAppInboundMessage_tenantId_idx" ON "WhatsAppInboundMessage"("tenantId");
CREATE INDEX "WhatsAppInboundMessage_fromPhone_idx" ON "WhatsAppInboundMessage"("fromPhone");
