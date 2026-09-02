import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding for PaperMill ERP...');

  // 1. Clean existing data in reverse relation order
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

  // 2. Hash default password
  const defaultPasswordHash = await bcrypt.hash('password123', 10);

  // 3. Seed Users (5 users, 1 for each role)
  console.log('👤 Seeding Users...');
  const users = [
    {
      name: 'Ramesh Patel (Admin)',
      email: 'admin@papermill.local',
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
    },
    {
      name: 'Pooja Shah (Sales)',
      email: 'sales@papermill.local',
      passwordHash: defaultPasswordHash,
      role: Role.SALES,
    },
    {
      name: 'Vikas Sharma (Planner)',
      email: 'planner@papermill.local',
      passwordHash: defaultPasswordHash,
      role: Role.PLANNER,
    },
    {
      name: 'Jagdish Yadav (Operator)',
      email: 'operator@papermill.local',
      passwordHash: defaultPasswordHash,
      role: Role.OPERATOR,
    },
    {
      name: 'Sunil Verma (Dispatch)',
      email: 'dispatch@papermill.local',
      passwordHash: defaultPasswordHash,
      role: Role.DISPATCH,
    },
  ];

  const createdUsers: Record<Role, any> = {} as any;
  for (const u of users) {
    const user = await prisma.user.create({ data: u });
    createdUsers[u.role] = user;
  }

  const adminId = createdUsers.ADMIN.id;

  // 4. Seed Machines (Rule B: Machines are dynamic database rows)
  console.log('🏭 Seeding Machines...');
  const machines = [
    {
      name: 'Machine 1 (196")',
      code: 'M1',
      maxDeckleInch: 196.0,
      minDeckleInch: 60.0,
      minTrimInch: 0.5,
      maxTrimInch: 6.0,
      minGsm: 80,
      maxGsm: 300,
      speedMpm: 450,
      createdById: adminId,
    },
    {
      name: 'Machine 2 (100")',
      code: 'M2',
      maxDeckleInch: 100.0,
      minDeckleInch: 40.0,
      minTrimInch: 0.5,
      maxTrimInch: 5.0,
      minGsm: 80,
      maxGsm: 250,
      speedMpm: 320,
      createdById: adminId,
    },
  ];

  for (const m of machines) {
    await prisma.machine.create({ data: m });
  }

  // 5. Seed Clients (8 realistic Indian clients)
  console.log('🏢 Seeding Clients...');
  const clientsData = [
    {
      name: 'Amber Corrugators Pvt Ltd',
      code: 'AMBER-01',
      gstin: '24AABCA1234F1Z5',
      addressLine1: 'Plot 42, GIDC Industrial Estate',
      addressLine2: 'Phase 2, Vatva',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '382445',
      contactPerson: 'Kishore Dave',
      phone: '+91 98250 11223',
      whatsappNumber: '919825011223',
      email: 'orders@amberpackaging.in',
      createdById: adminId,
    },
    {
      name: 'Shanti Box Manufacturing Co',
      code: 'SHANTI-02',
      gstin: '27AABCS5678G1Z2',
      addressLine1: 'Gala No. 12, Jai Industrial Complex',
      addressLine2: 'MIDC Rabale',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      pincode: '400701',
      contactPerson: 'Suresh Patil',
      phone: '+91 98200 44556',
      whatsappNumber: '919820044556',
      email: 'purchase@shantiboxes.com',
      createdById: adminId,
    },
    {
      name: 'Apex Paper & Packaging',
      code: 'APEX-03',
      gstin: '24AAACA9876E1ZT',
      addressLine1: 'Survey No. 108, NH 48',
      addressLine2: 'Near Overbridge, Chala',
      city: 'Vapi',
      state: 'Gujarat',
      pincode: '396191',
      contactPerson: 'Mehul Mehta',
      phone: '+91 98795 33221',
      whatsappNumber: '919879533221',
      email: 'orders@apexpack.co.in',
      createdById: adminId,
    },
    {
      name: 'Gujarat Paper Crafts',
      code: 'GUJPAP-04',
      gstin: '24AACFG4432H1Z9',
      addressLine1: 'Plot 18, Sachin GIDC',
      addressLine2: 'Road No. 4',
      city: 'Surat',
      state: 'Gujarat',
      pincode: '394230',
      contactPerson: 'Nitin Jariwala',
      phone: '+91 98241 88990',
      whatsappNumber: '919824188990',
      email: 'nitin@gujaratpapercrafts.com',
      createdById: adminId,
    },
    {
      name: 'Surya Duplex & Kraft Converters',
      code: 'SURYA-05',
      gstin: '08AABCS9912D1ZR',
      addressLine1: 'RIICO Industrial Area',
      addressLine2: 'Bhiwadi Ext.',
      city: 'Bhiwadi',
      state: 'Rajasthan',
      pincode: '301019',
      contactPerson: 'Rajendra Singh',
      phone: '+91 94140 77889',
      whatsappNumber: '919414077889',
      email: 'purchase@suryakraft.in',
      createdById: adminId,
    },
    {
      name: 'Mahaveer Packaging Industries',
      code: 'MAHAVIR-06',
      gstin: '24AABCM3311A1Z0',
      addressLine1: 'Shed 5B, Aji GIDC Industrial Area',
      addressLine2: 'Ring Road',
      city: 'Rajkot',
      state: 'Gujarat',
      pincode: '360003',
      contactPerson: 'Bhavin Vora',
      phone: '+91 98252 66778',
      whatsappNumber: '919825266778',
      email: 'bhavin@mahaveerpack.in',
      createdById: adminId,
    },
    {
      name: 'Krishna Containers & Packaging',
      code: 'KRISHNA-07',
      gstin: '23AABCK2299J1ZP',
      addressLine1: 'Sector 3, Pithampur Industrial Area',
      addressLine2: 'Dhar Road',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '454775',
      contactPerson: 'Deepak Agrawal',
      phone: '+91 98930 11992',
      whatsappNumber: '919893011992',
      email: 'sales@krishnacontainers.com',
      createdById: adminId,
    },
    {
      name: 'Balaji Boards & Boxes',
      code: 'BALAJI-08',
      gstin: '27AABCB8844C1Z4',
      addressLine1: 'B-14, Waluj MIDC',
      addressLine2: 'Station Road',
      city: 'Aurangabad',
      state: 'Maharashtra',
      pincode: '431136',
      contactPerson: 'Sunil Deshmukh',
      phone: '+91 94222 55331',
      whatsappNumber: '919422255331',
      email: 'balajiboxes@rediffmail.com',
      createdById: adminId,
    },
  ];

  for (const c of clientsData) {
    await prisma.client.create({ data: c });
  }

  // 6. Seed Transporters & Trucks
  console.log('🚚 Seeding Transporters and Trucks...');
  const transporter1 = await prisma.transporter.create({
    data: {
      name: 'Shree Ganesh Roadlines',
      phone: '+91 98251 00001',
      gstin: '24AABCS1111A1Z9',
      createdById: adminId,
    },
  });

  const transporter2 = await prisma.transporter.create({
    data: {
      name: 'VRL Express Logistics',
      phone: '+91 98251 00002',
      gstin: '29AABCV2222B1Z8',
      createdById: adminId,
    },
  });

  const transporter3 = await prisma.transporter.create({
    data: {
      name: 'SafeX Freight Carriers',
      phone: '+91 98251 00003',
      gstin: '27AABCS3333C1Z7',
      createdById: adminId,
    },
  });

  const trucksData = [
    {
      registrationNumber: 'GJ-01-AB-1234',
      capacityKg: 16000,
      transporterId: transporter1.id,
      createdById: adminId,
    },
    {
      registrationNumber: 'GJ-06-GH-5678',
      capacityKg: 22000,
      transporterId: transporter1.id,
      createdById: adminId,
    },
    {
      registrationNumber: 'MH-04-CD-9012',
      capacityKg: 25000,
      transporterId: transporter2.id,
      createdById: adminId,
    },
    {
      registrationNumber: 'DL-01-EF-3456',
      capacityKg: 18000,
      transporterId: transporter2.id,
      createdById: adminId,
    },
    {
      registrationNumber: 'RJ-14-IJ-7890',
      capacityKg: 20000,
      transporterId: transporter3.id,
      createdById: adminId,
    },
  ];

  for (const t of trucksData) {
    await prisma.truck.create({ data: t });
  }

  console.log('✅ Seed completed successfully!');
  console.log('\nDefault Accounts (Password: password123):');
  console.log('  ADMIN:    admin@papermill.local');
  console.log('  SALES:    sales@papermill.local');
  console.log('  PLANNER:  planner@papermill.local');
  console.log('  OPERATOR: operator@papermill.local');
  console.log('  DISPATCH: dispatch@papermill.local\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
