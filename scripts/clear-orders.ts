import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing all orders and operational transactional data...');

  // 1. WhatsApp Notifications
  await prisma.whatsAppNotification.deleteMany();

  // 2. Invoices & Lines
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();

  // 3. Dispatches
  await prisma.dispatch.deleteMany();

  // 4. Wastage Logs
  await prisma.wastageLog.deleteMany();

  // 5. Stock Items
  await prisma.stockItem.deleteMany();

  // 6. Load Batches & Order Links
  await prisma.loadBatchOrder.deleteMany();
  await prisma.loadBatch.deleteMany();

  // 7. Production Runs & Cutting Patterns
  await prisma.patternCut.deleteMany();
  await prisma.cuttingPattern.deleteMany();
  await prisma.productionRun.deleteMany();

  // 8. Order Items & Orders
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();

  // 9. Clean Order-related Audit Logs
  await prisma.auditLog.deleteMany({
    where: {
      entityType: {
        in: ['Order', 'OrderItem', 'ProductionRun', 'LoadBatch', 'Invoice', 'Dispatch', 'StockItem'],
      },
    },
  });

  console.log('✅ All orders and associated transactions have been completely removed!');
}

main()
  .catch((e) => {
    console.error('❌ Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
