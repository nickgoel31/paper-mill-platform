import {
  PrismaClient,
  Role,
  OrderStatus,
  OrderPriority,
  RunStatus,
  LoadStatus,
  StockStatus,
  InvoiceStatus,
  NotificationStatus,
  Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting Full Demo Seed (30 Orders across 4 GSM grades)...");

  // 1. Clear database
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
  await prisma.truck.deleteMany();
  await prisma.transporter.deleteMany();
  await prisma.machine.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSetting.deleteMany();

  // 2. Default System Settings
  console.log("⚙️  Seeding System Settings...");
  const settings = [
    { key: "millName", value: "HRA Paper Mill Private Limited" },
    { key: "millAddress", value: "Plot No. 45-48, Industrial Growth Area, Jaipur, Rajasthan - 302013" },
    { key: "millGstin", value: "08AAAAH1234F1Z5" },
    { key: "millState", value: "Rajasthan" },
    { key: "bankName", value: "HDFC Bank Ltd" },
    { key: "bankAccountName", value: "HRA Paper Mill Private Limited" },
    { key: "bankAccountNumber", value: "50200088991122" },
    { key: "bankIfsc", value: "HDFC0001234" },
    { key: "defaultGstRate", value: "18.0" },
    { key: "trimPercentTarget", value: "3.0" },
  ];
  for (const s of settings) {
    await prisma.systemSetting.create({ data: s });
  }

  // 3. Seed Users
  console.log("👤 Seeding Users...");
  const passwordHash = await bcrypt.hash("password123", 10);
  const admin = await prisma.user.create({
    data: { name: "Ramesh Patel (Admin)", email: "admin@papermill.local", passwordHash, role: Role.ADMIN },
  });
  const sales = await prisma.user.create({
    data: { name: "Pooja Shah (Sales)", email: "sales@papermill.local", passwordHash, role: Role.SALES },
  });
  const planner = await prisma.user.create({
    data: { name: "Vikas Sharma (Planner)", email: "planner@papermill.local", passwordHash, role: Role.PLANNER },
  });
  const operator = await prisma.user.create({
    data: { name: "Jagdish Yadav (Operator)", email: "operator@papermill.local", passwordHash, role: Role.OPERATOR },
  });
  const dispatchUser = await prisma.user.create({
    data: { name: "Surendra Singh (Dispatch)", email: "dispatch@papermill.local", passwordHash, role: Role.DISPATCH },
  });

  // 4. Seed Clients
  console.log("🏢 Seeding Clients...");
  const clientsData = [
    { code: "KRP-001", name: "Krishna Packaging Industries", city: "Ahmedabad", state: "Gujarat", phone: "+91 98250 11223", whatsappNumber: "+91 98250 11223", gstin: "24AAACK1234D1Z2" },
    { code: "SNP-002", name: "Sunrise Corrugators Pvt Ltd", city: "Surat", state: "Gujarat", phone: "+91 98251 22334", whatsappNumber: "+91 98251 22334", gstin: "24AAACS5678E1Z4" },
    { code: "VNP-003", name: "Vanguard Paper Box LLP", city: "Jaipur", state: "Rajasthan", phone: "+91 94140 33445", whatsappNumber: "+91 94140 33445", gstin: "08AAACV9012F1Z6" },
    { code: "BLP-004", name: "Balaji Cartons & Containers", city: "Jodhpur", state: "Rajasthan", phone: "+91 94141 44556", whatsappNumber: "+91 94141 44556", gstin: "08AAACB3456G1Z8" },
    { code: "GMP-005", name: "Global Marvel Packaging", city: "Mumbai", state: "Maharashtra", phone: "+91 98200 55667", whatsappNumber: "+91 98200 55667", gstin: "27AAACG7890H1Z0" },
    { code: "APX-006", name: "Apex Kraft Converters", city: "Pune", state: "Maharashtra", phone: "+91 98201 66778", whatsappNumber: "+91 98201 66778", gstin: "27AAACA1234J1Z2" },
    { code: "DLK-007", name: "Delhi Kraft Board House", city: "New Delhi", state: "Delhi", phone: "+91 98110 77889", whatsappNumber: "+91 98110 77889", gstin: "07AAACD5678K1Z4" },
    { code: "HRP-008", name: "Haryana Box Makers", city: "Faridabad", state: "Haryana", phone: "+91 98111 88990", whatsappNumber: "+91 98111 88990", gstin: "06AAACH9012L1Z6" },
  ];

  const clients = await Promise.all(
    clientsData.map((c) =>
      prisma.client.create({
        data: {
          ...c,
          addressLine1: "Industrial Phase II",
          pincode: "302013",
          createdById: admin.id,
        },
      })
    )
  );

  // 5. Seed Machines (Dynamic Rule B)
  console.log("🏭 Seeding Dynamic Paper Machines...");
  const m1 = await prisma.machine.create({
    data: {
      code: "M1",
      name: "Machine 1 (196 Inch Deckle)",
      maxDeckleInch: new Prisma.Decimal("196.00"),
      minDeckleInch: new Prisma.Decimal("60.00"),
      minTrimInch: new Prisma.Decimal("0.50"),
      maxTrimInch: new Prisma.Decimal("6.00"),
      minGsm: 80,
      maxGsm: 300,
      speedMpm: 650,
      createdById: admin.id,
    },
  });

  const m2 = await prisma.machine.create({
    data: {
      code: "M2",
      name: "Machine 2 (100 Inch Deckle)",
      maxDeckleInch: new Prisma.Decimal("100.00"),
      minDeckleInch: new Prisma.Decimal("40.00"),
      minTrimInch: new Prisma.Decimal("0.50"),
      maxTrimInch: new Prisma.Decimal("4.00"),
      minGsm: 100,
      maxGsm: 280,
      speedMpm: 450,
      createdById: admin.id,
    },
  });

  // 6. Transporters & Trucks
  console.log("🚚 Seeding Transporters and Trucks...");
  const trans1 = await prisma.transporter.create({
    data: { name: "Marwar Freight Carriers", phone: "+91 94142 55667", gstin: "08AAACM1234F1Z1", createdById: admin.id },
  });
  const trans2 = await prisma.transporter.create({
    data: { name: "Gujarat Roadways Express", phone: "+91 98252 66778", gstin: "24AAACG5678E1Z3", createdById: admin.id },
  });

  const truck1 = await prisma.truck.create({
    data: {
      registrationNumber: "RJ-14-GA-9021",
      capacityKg: 25000,
      owner: { connect: { id: trans1.id } },
      transporter: { connect: { id: admin.id } },
    },
  });
  const truck2 = await prisma.truck.create({
    data: {
      registrationNumber: "GJ-01-AX-4512",
      capacityKg: 32000,
      owner: { connect: { id: trans2.id } },
      transporter: { connect: { id: admin.id } },
    },
  });

  // 7. Seed 30 Orders across 4 GSMs (120, 150, 180, 220)
  console.log("📦 Generating 30 Realistic Sales Orders across 4 GSM grades...");
  const gsms = [120, 150, 180, 220];
  const widths = [130.0, 32.0, 27.0, 45.0, 55.0, 60.0, 38.0, 52.0];
  const orderIds: string[] = [];

  for (let i = 1; i <= 30; i++) {
    const client = clients[(i - 1) % clients.length];
    const gsm = gsms[(i - 1) % gsms.length];
    const orderNum = `SO-2601-${String(i).padStart(4, "0")}`;

    const item1Width = widths[(i * 3) % widths.length];
    const item2Width = widths[(i * 5) % widths.length];
    const item1Qty = 4000 + (i % 5) * 1500;
    const item2Qty = 3000 + (i % 4) * 1000;
    const totalQty = item1Qty + item2Qty;

    const deliveryDaysOffset = -5 + (i % 15); // Some past, some today, some future
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + deliveryDaysOffset);

    const priority = i % 8 === 0 ? OrderPriority.URGENT : i % 5 === 0 ? OrderPriority.STOCK : OrderPriority.NORMAL;

    const ord = await prisma.order.create({
      data: {
        orderNumber: orderNum,
        clientId: client.id,
        orderDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        deliveryDate,
        priority,
        status: i <= 8 ? OrderStatus.CONFIRMED : i <= 15 ? OrderStatus.PLANNED : i <= 22 ? OrderStatus.PRODUCED : OrderStatus.DISPATCHED,
        createdById: sales.id,
        items: {
          create: [
            {
              widthInch: new Prisma.Decimal(item1Width.toFixed(2)),
              gsm,
              quantityKg: new Prisma.Decimal(item1Qty.toFixed(3)),
              producedKg: new Prisma.Decimal((i > 15 ? item1Qty : 0).toFixed(3)),
              dispatchedKg: new Prisma.Decimal((i > 22 ? item1Qty : 0).toFixed(3)),
              ratePerKg: new Prisma.Decimal("38.50"),
              tolerancePercent: new Prisma.Decimal("5.00"),
            },
            {
              widthInch: new Prisma.Decimal(item2Width.toFixed(2)),
              gsm,
              quantityKg: new Prisma.Decimal(item2Qty.toFixed(3)),
              producedKg: new Prisma.Decimal((i > 15 ? item2Qty : 0).toFixed(3)),
              dispatchedKg: new Prisma.Decimal((i > 22 ? item2Qty : 0).toFixed(3)),
              ratePerKg: new Prisma.Decimal("39.00"),
              tolerancePercent: new Prisma.Decimal("5.00"),
            },
          ],
        },
      },
    });

    orderIds.push(ord.id);
  }

  // 8. Seed Production Runs (Rule A: 1 GSM per run)
  console.log("⚙️  Seeding Production Runs & Cutting Patterns (Rule A compliant)...");
  const run1 = await prisma.productionRun.create({
    data: {
      runNumber: "PR-2601-0001",
      machineId: m1.id,
      gsm: 120,
      status: RunStatus.COMPLETED,
      totalPlannedKg: new Prisma.Decimal("24500.00"),
      totalActualKg: new Prisma.Decimal("24620.00"),
      totalTrimPercent: new Prisma.Decimal("1.02"),
      plannedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      createdById: planner.id,
      wastageLogs: {
        create: [
          { wastageKg: new Prisma.Decimal("250.00"), wastageType: "TRIM", reason: "Standard edge trim", createdById: operator.id },
          { wastageKg: new Prisma.Decimal("80.00"), wastageType: "REJECT", reason: "Slitter adjustment scrap", createdById: operator.id },
        ],
      },
    },
  });

  const run2 = await prisma.productionRun.create({
    data: {
      runNumber: "PR-2601-0002",
      machineId: m2.id,
      gsm: 150,
      status: RunStatus.RUNNING,
      totalPlannedKg: new Prisma.Decimal("18200.00"),
      totalTrimPercent: new Prisma.Decimal("2.45"),
      plannedDate: new Date(),
      startedAt: new Date(),
      createdById: planner.id,
    },
  });

  // 9. Seed Available & Allocated Stock Items
  console.log("📦 Seeding Inventory Reels (StockItems)...");
  await prisma.stockItem.createMany({
    data: [
      { widthInch: new Prisma.Decimal("130.00"), gsm: 120, quantityKg: new Prisma.Decimal("3250.00"), status: StockStatus.AVAILABLE, location: "BAY-M1-01" },
      { widthInch: new Prisma.Decimal("32.00"), gsm: 120, quantityKg: new Prisma.Decimal("1800.00"), status: StockStatus.AVAILABLE, location: "BAY-M1-02" },
      { widthInch: new Prisma.Decimal("27.00"), gsm: 120, quantityKg: new Prisma.Decimal("1500.00"), status: StockStatus.AVAILABLE, location: "BAY-M1-03" },
      { widthInch: new Prisma.Decimal("45.00"), gsm: 150, quantityKg: new Prisma.Decimal("2400.00"), status: StockStatus.AVAILABLE, location: "BAY-M2-01" },
      { widthInch: new Prisma.Decimal("55.00"), gsm: 180, quantityKg: new Prisma.Decimal("3100.00"), status: StockStatus.AVAILABLE, location: "BAY-M1-04" },
    ],
  });

  // 10. Seed Load Batch & Dispatch
  console.log("🚚 Seeding Load Batch, Gate Pass, Invoices & Notifications...");
  const batch1 = await prisma.loadBatch.create({
    data: {
      batchNumber: "LB-2601-0001",
      truckId: truck1.id,
      transporterId: trans1.id,
      status: LoadStatus.DISPATCHED,
      plannedDispatchDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      dispatchedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      totalPlannedKg: new Prisma.Decimal("23500.00"),
      driverName: "Bhanwar Lal",
      driverPhone: "+91 98765 01001",
      createdById: planner.id,
      orders: {
        create: [
          { orderId: orderIds[23] },
          { orderId: orderIds[24] },
          { orderId: orderIds[25] },
          { orderId: orderIds[26] },
        ],
      },
    },
  });

  const dispatch1 = await prisma.dispatch.create({
    data: {
      dispatchNumber: "DSP-2601-0001",
      loadBatchId: batch1.id,
      gatePassNumber: "GP-2601-0001",
      vehicleNumber: "RJ-14-GA-9021",
      driverName: "Bhanwar Lal",
      driverPhone: "+91 98765 01001",
      totalDispatchedKg: new Prisma.Decimal("23500.00"),
      dispatchedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      createdById: dispatchUser.id,
    },
  });

  // 11. Seed GST Invoices
  await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2526-0001",
      clientId: clients[0].id,
      dispatchId: dispatch1.id,
      loadBatchId: batch1.id,
      subtotal: new Prisma.Decimal("345000.00"),
      igst: new Prisma.Decimal("62100.00"),
      totalAmount: new Prisma.Decimal("407100.00"),
      status: InvoiceStatus.ISSUED,
      createdById: admin.id,
      lines: {
        create: [
          {
            description: "Kraft Paper 120 GSM - 130.00\" Reel (HSN 4804)",
            quantityKg: new Prisma.Decimal("5000.00"),
            ratePerKg: new Prisma.Decimal("38.50"),
            amount: new Prisma.Decimal("192500.00"),
          },
          {
            description: "Kraft Paper 120 GSM - 32.00\" Reel (HSN 4804)",
            quantityKg: new Prisma.Decimal("3910.25"),
            ratePerKg: new Prisma.Decimal("39.00"),
            amount: new Prisma.Decimal("152500.00"),
          },
        ],
      },
    },
  });

  // 12. Seed WhatsApp Notifications (3 Notifications for 3 Distinct Clients - Rule E)
  await prisma.whatsAppNotification.createMany({
    data: [
      {
        loadBatchId: batch1.id,
        clientId: clients[0].id,
        phoneNumber: "919825011223",
        templateName: "order_dispatched",
        payload: {
          clientName: clients[0].name,
          ordersList: "SO-2601-0024",
          vehicleNumber: "RJ-14-GA-9021",
          driverName: "Bhanwar Lal",
          driverPhone: "+91 98765 01001",
          dispatchedKg: "8,910",
        },
        status: NotificationStatus.SENT,
        providerMessageId: "dry_run_wamid_001",
        sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      {
        loadBatchId: batch1.id,
        clientId: clients[1].id,
        phoneNumber: "919825122334",
        templateName: "order_dispatched",
        payload: {
          clientName: clients[1].name,
          ordersList: "SO-2601-0025, SO-2601-0026",
          vehicleNumber: "RJ-14-GA-9021",
          driverName: "Bhanwar Lal",
          driverPhone: "+91 98765 01001",
          dispatchedKg: "9,200",
        },
        status: NotificationStatus.SENT,
        providerMessageId: "dry_run_wamid_002",
        sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      {
        loadBatchId: batch1.id,
        clientId: clients[2].id,
        phoneNumber: "919414033445",
        templateName: "order_dispatched",
        payload: {
          clientName: clients[2].name,
          ordersList: "SO-2601-0027",
          vehicleNumber: "RJ-14-GA-9021",
          driverName: "Bhanwar Lal",
          driverPhone: "+91 98765 01001",
          dispatchedKg: "5,390",
        },
        status: NotificationStatus.QUEUED,
      },
    ],
  });

  console.log("✅ Full Demo Seed Completed Successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
