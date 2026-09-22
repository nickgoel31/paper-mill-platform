ALTER TABLE "Tenant" ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "whatsappAccessToken" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "whatsappPhoneNumberId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "whatsappApiVersion" TEXT;

ALTER TABLE "StockItem" ADD COLUMN "remarks" TEXT;
