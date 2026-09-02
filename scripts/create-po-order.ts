import { PrismaClient, OrderPriority, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📄 Creating Order from Purchase Order: DL/2627/PO/D/01070...');

  // 1. Find or create Client "SHITTLA PAPER GLOBAL PRIVATE LIMITED"
  let client = await prisma.client.findFirst({
    where: {
      OR: [
        { code: 'SHITLA' },
        { name: { contains: 'Shittla', mode: 'insensitive' } },
        { name: { contains: 'Shitla', mode: 'insensitive' } },
      ],
    },
  });

  if (!client) {
    console.log('Client not found, creating Client...');
    client = await prisma.client.create({
      data: {
        name: 'SHITTLA PAPER GLOBAL PRIVATE LIMITED',
        code: 'SHITTLA',
        gstin: '07AAFCS2993C1ZB',
        addressLine1: 'WZ-29, BHAGWAN DAS NAGAR EXTENSION',
        addressLine2: 'EAST PUNJABI BAGH',
        city: 'DELHI',
        state: 'Delhi',
        pincode: '110026',
        contactPerson: 'ANKIT',
        phone: '9910012403',
        whatsappNumber: '9910012403',
        email: 'Purchase@sheetlapapers.com',
      },
    });
  } else {
    // Update GSTIN/address if needed
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        name: 'SHITTLA PAPER GLOBAL PRIVATE LIMITED',
        gstin: '07AAFCS2993C1ZB',
        contactPerson: 'ANKIT',
        phone: '9910012403',
        whatsappNumber: '9910012403',
        email: 'Purchase@sheetlapapers.com',
      },
    });
  }

  // 2. Find admin user for createdById
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  // 3. Define the 15 line items from the Purchase Order
  const poItems = [
    // Items 1-8: 140 GSM (18BF VK 140 GSM GY Shade, Rate: 33.60)
    { widthInch: 28, gsm: 140, quantityKg: 392.00, ratePerKg: 33.60 },
    { widthInch: 26, gsm: 140, quantityKg: 364.00, ratePerKg: 33.60 },
    { widthInch: 30, gsm: 140, quantityKg: 420.00, ratePerKg: 33.60 },
    { widthInch: 33, gsm: 140, quantityKg: 462.00, ratePerKg: 33.60 },
    { widthInch: 36, gsm: 140, quantityKg: 504.00, ratePerKg: 33.60 },
    { widthInch: 47, gsm: 140, quantityKg: 658.00, ratePerKg: 33.60 },
    { widthInch: 48, gsm: 140, quantityKg: 672.00, ratePerKg: 33.60 },
    { widthInch: 49, gsm: 140, quantityKg: 686.00, ratePerKg: 33.60 },

    // Items 9-15: 120 GSM (18BF SK 120 GSM NATURAL Shade, Rate: 33.10)
    { widthInch: 26, gsm: 120, quantityKg: 364.00, ratePerKg: 33.10 },
    { widthInch: 28, gsm: 120, quantityKg: 392.00, ratePerKg: 33.10 },
    { widthInch: 36, gsm: 120, quantityKg: 504.00, ratePerKg: 33.10 },
    { widthInch: 40, gsm: 120, quantityKg: 1120.00, ratePerKg: 33.10 },
    { widthInch: 45, gsm: 120, quantityKg: 630.00, ratePerKg: 33.10 },
    { widthInch: 47, gsm: 120, quantityKg: 1316.00, ratePerKg: 33.10 },
    { widthInch: 49, gsm: 120, quantityKg: 1372.00, ratePerKg: 33.10 },
  ];

  const totalKg = poItems.reduce((sum, item) => sum + item.quantityKg, 0);

  // 4. Create the Order
  const orderNumber = 'SO-DL-01070';
  
  // Clean up if already exists
  const existingOrder = await prisma.order.findUnique({
    where: { orderNumber },
  });
  if (existingOrder) {
    await prisma.orderItem.deleteMany({ where: { orderId: existingOrder.id } });
    await prisma.order.delete({ where: { id: existingOrder.id } });
  }

  const order = await prisma.order.create({
    data: {
      orderNumber,
      clientId: client.id,
      orderDate: new Date('2026-08-18'),
      deliveryDate: new Date('2026-08-25'),
      priority: OrderPriority.URGENT, // PO specifies "URGENT DISPATCH REQUIRED"
      status: OrderStatus.CONFIRMED,
      notes: 'PO No: DL/2627/PO/D/01070. Consignee: KWALITY PACKERS, Village Khadeen, Parwanoo, HP. Material to be loaded horizontally only. Jointless paper. Moisture tolerance +/-7%, GSM tolerance +/-5%. Contact: ANKIT (9910012403). Total 18 reels, 9,856 kg.',
      createdById: adminUser?.id,
      items: {
        create: poItems.map((item) => ({
          widthInch: item.widthInch,
          gsm: item.gsm,
          quantityKg: item.quantityKg,
          ratePerKg: item.ratePerKg,
          tolerancePercent: 5.0, // Per PO T&C: GSM Variation Tolerable upto +-5%
        })),
      },
    },
    include: {
      items: true,
      client: true,
    },
  });

  console.log(`✅ Order ${order.orderNumber} successfully created with ${order.items.length} items (${totalKg.toLocaleString()} kg)!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
