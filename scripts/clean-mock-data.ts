import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning all transactional mock data from the database...");

  // Delete all transactional & operational mock records
  await prisma.auditLog.deleteMany();
  await prisma.whatsAppNotification.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.dispatch.deleteMany();
  await prisma.wastageLog.deleteMany();
  await prisma.stockItem.deleteMany();
  await prisma.patternCut.deleteMany();
  await prisma.cuttingPattern.deleteMany();
  await prisma.productionRun.deleteMany();
  await prisma.loadBatchOrder.deleteMany();
  await prisma.loadBatch.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();

  console.log("✨ All transactional mock data (Orders, Runs, Dispatches, Invoices, Stock, Wastage, Notifications) removed!");
  console.log("🔒 User accounts, paper machines, transporters, and system settings are preserved so you can log in and start fresh.");
}

main()
  .catch((e) => {
    console.error("❌ Clean failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
