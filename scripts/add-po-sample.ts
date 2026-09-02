import { PrismaClient, OrderPriority, OrderStatus, Role } from "@prisma/client";
import { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("📄 Adding Purchase Order DL/2627/PO/D/01070 to ERP...");

  // 1. Get or create admin user for createdById
  let adminUser = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });

  if (!adminUser) {
    throw new Error("No admin user found in system.");
  }

  // 2. Find or Create the Client (Shittla Paper Global Pvt Ltd)
  const clientCode = "SPG-1070";
  let client = await prisma.client.findUnique({
    where: { code: clientCode },
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        code: clientCode,
        name: "Shittla Paper Global Private Limited",
        gstin: "07AAFCS2993C1ZB",
        addressLine1: "WZ-29, Bhagwan Das Nagar Extension",
        addressLine2: "East Punjabi Bagh",
        city: "Delhi",
        state: "Delhi",
        pincode: "110026",
        contactPerson: "Ankit",
        phone: "+91 75330 44044",
        whatsappNumber: "+91 99100 12403",
        email: "Purchase@sheetlapapers.com",
        createdById: adminUser.id,
      },
    });
    console.log(`✅ Created Client: ${client.name} (${client.code})`);
  } else {
    console.log(`ℹ️ Client already exists: ${client.name}`);
  }

  // 3. Create the Sales Order
  const orderNumber = "SO-DL-01070"; // or "DL/2627/PO/D/01070"
  
  // Clean up if previous exists
  const existingOrder = await prisma.order.findUnique({
    where: { orderNumber },
  });
  if (existingOrder) {
    await prisma.orderItem.deleteMany({ where: { orderId: existingOrder.id } });
    await prisma.order.delete({ where: { id: existingOrder.id } });
  }

  const orderDate = new Date("2026-08-18T00:00:00Z");
  // Set promised delivery date (e.g., 7 days from order date)
  const deliveryDate = new Date("2026-08-25T00:00:00Z");

  const orderNotes = [
    "PO No: DL/2627/PO/D/01070",
    "Consignee: KWALITY PACKERS, Parwanoo, Himachal Pradesh (GSTIN: 02BORPS3397L1Z5)",
    "Payment Terms: 30 DAYS",
    "Special Instructions: Material should be loaded horizontal only. Jointless paper. Moisture tolerance +-7%.",
    "Total Weight: 9,856 KG (18 Reels across 15 sizes). Freight included in rates.",
  ].join(" | ");

  const order = await prisma.order.create({
    data: {
      orderNumber,
      clientId: client.id,
      orderDate,
      deliveryDate,
      priority: OrderPriority.URGENT,
      status: OrderStatus.CONFIRMED,
      notes: orderNotes,
      createdById: adminUser.id,
    },
  });

  console.log(`✅ Created Order: ${order.orderNumber} (Status: ${order.status}, Priority: ${order.priority})`);

  // 4. Create the 15 Line Items
  const items = [
    // 140 GSM Items (VK 140 GSM GY Shade, Rate: ₹34.00/kg, Tol: 5%)
    { widthInch: 28.00, gsm: 140, quantityKg: 392.00, ratePerKg: 34.00, tolerancePercent: 5.00 },
    { widthInch: 26.00, gsm: 140, quantityKg: 364.00, ratePerKg: 34.00, tolerancePercent: 5.00 },
    { widthInch: 30.00, gsm: 140, quantityKg: 420.00, ratePerKg: 34.00, tolerancePercent: 5.00 },
    { widthInch: 33.00, gsm: 140, quantityKg: 462.00, ratePerKg: 34.00, tolerancePercent: 5.00 },
    { widthInch: 36.00, gsm: 140, quantityKg: 504.00, ratePerKg: 34.00, tolerancePercent: 5.00 },
    { widthInch: 47.00, gsm: 140, quantityKg: 658.00, ratePerKg: 34.00, tolerancePercent: 5.00 },
    { widthInch: 48.00, gsm: 140, quantityKg: 672.00, ratePerKg: 34.00, tolerancePercent: 5.00 },
    { widthInch: 49.00, gsm: 140, quantityKg: 686.00, ratePerKg: 34.00, tolerancePercent: 5.00 },

    // 120 GSM Items (SK 120 GSM NATURAL Shade, Rate: ₹33.50/kg, Tol: 5%)
    { widthInch: 26.00, gsm: 120, quantityKg: 364.00, ratePerKg: 33.50, tolerancePercent: 5.00 },
    { widthInch: 28.00, gsm: 120, quantityKg: 392.00, ratePerKg: 33.50, tolerancePercent: 5.00 },
    { widthInch: 36.00, gsm: 120, quantityKg: 504.00, ratePerKg: 33.50, tolerancePercent: 5.00 },
    { widthInch: 40.00, gsm: 120, quantityKg: 1120.00, ratePerKg: 33.50, tolerancePercent: 5.00 },
    { widthInch: 45.00, gsm: 120, quantityKg: 630.00, ratePerKg: 33.50, tolerancePercent: 5.00 },
    { widthInch: 47.00, gsm: 120, quantityKg: 1316.00, ratePerKg: 33.50, tolerancePercent: 5.00 },
    { widthInch: 49.00, gsm: 120, quantityKg: 1372.00, ratePerKg: 33.50, tolerancePercent: 5.00 },
  ];

  let totalWeight = 0;
  let totalAmount = 0;

  for (const it of items) {
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        widthInch: new Prisma.Decimal(it.widthInch.toFixed(2)),
        gsm: it.gsm,
        quantityKg: new Prisma.Decimal(it.quantityKg.toFixed(3)),
        ratePerKg: new Prisma.Decimal(it.ratePerKg.toFixed(2)),
        tolerancePercent: new Prisma.Decimal(it.tolerancePercent.toFixed(2)),
      },
    });
    totalWeight += it.quantityKg;
    totalAmount += it.quantityKg * it.ratePerKg;
  }

  console.log(`✅ Added ${items.length} Order Items.`);
  console.log(`📊 Summary: Total Weight: ${totalWeight.toLocaleString()} KG (9.856 MT) | Gross Taxable: ₹${totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
}

main()
  .catch((e) => {
    console.error("❌ Failed to add purchase order:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
