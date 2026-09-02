import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultStockPresets = [
  {
    name: "18BF VK 140 GSM (28 Inch)",
    code: "PRESET-140-28",
    widthInch: 28.0,
    gsm: 140,
    standardWeightKg: 392.0,
    defaultLocation: "BAY-A (Primary Warehouse)",
    shade: "GY",
    bf: "18BF",
    paperType: "KRAFT",
    description: "High-runner 140 GSM reel size for Shittla Paper & Kwality Packers orders.",
  },
  {
    name: "18BF VK 140 GSM (26 Inch)",
    code: "PRESET-140-26",
    widthInch: 26.0,
    gsm: 140,
    standardWeightKg: 364.0,
    defaultLocation: "BAY-A (Primary Warehouse)",
    shade: "GY",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Standard 26-inch reel for corrugation lines.",
  },
  {
    name: "18BF VK 140 GSM (36 Inch)",
    code: "PRESET-140-36",
    widthInch: 36.0,
    gsm: 140,
    standardWeightKg: 504.0,
    defaultLocation: "BAY-A (Primary Warehouse)",
    shade: "GY",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Standard 36-inch corrugation width (half-meter target).",
  },
  {
    name: "18BF VK 140 GSM (47 Inch)",
    code: "PRESET-140-47",
    widthInch: 47.0,
    gsm: 140,
    standardWeightKg: 658.0,
    defaultLocation: "BAY-B (High GSM Reels)",
    shade: "GY",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Wide reel size for high-speed automatic 5-ply box making.",
  },
  {
    name: "18BF VK 140 GSM (49 Inch)",
    code: "PRESET-140-49",
    widthInch: 49.0,
    gsm: 140,
    standardWeightKg: 686.0,
    defaultLocation: "BAY-B (High GSM Reels)",
    shade: "GY",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Master deckle pairing size for 196\" machine.",
  },
  {
    name: "18BF SK 120 GSM (26 Inch)",
    code: "PRESET-120-26",
    widthInch: 26.0,
    gsm: 120,
    standardWeightKg: 364.0,
    defaultLocation: "BAY-C (Narrow Widths)",
    shade: "NATURAL",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Lightweight 120 GSM fluting/inner liner.",
  },
  {
    name: "18BF SK 120 GSM (40 Inch)",
    code: "PRESET-120-40",
    widthInch: 40.0,
    gsm: 120,
    standardWeightKg: 560.0,
    defaultLocation: "BAY-A (Primary Warehouse)",
    shade: "NATURAL",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Popular 40-inch standard packaging size.",
  },
  {
    name: "18BF SK 120 GSM (47 Inch)",
    code: "PRESET-120-47",
    widthInch: 47.0,
    gsm: 120,
    standardWeightKg: 658.0,
    defaultLocation: "BAY-A (Primary Warehouse)",
    shade: "NATURAL",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Standard 120 GSM fluting width.",
  },
  {
    name: "18BF SK 120 GSM (49 Inch)",
    code: "PRESET-120-49",
    widthInch: 49.0,
    gsm: 120,
    standardWeightKg: 686.0,
    defaultLocation: "BAY-A (Primary Warehouse)",
    shade: "NATURAL",
    bf: "18BF",
    paperType: "KRAFT",
    description: "Fast-moving 49-inch reel for corrugators.",
  },
];

async function seedStockPresets() {
  console.log('📦 Seeding Stock Item Presets...');
  
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  for (const preset of defaultStockPresets) {
    await prisma.stockPreset.upsert({
      where: { code: preset.code },
      update: {
        name: preset.name,
        widthInch: preset.widthInch,
        gsm: preset.gsm,
        standardWeightKg: preset.standardWeightKg,
        defaultLocation: preset.defaultLocation,
        shade: preset.shade,
        bf: preset.bf,
        paperType: preset.paperType,
        description: preset.description,
        createdById: admin?.id,
      },
      create: {
        name: preset.name,
        code: preset.code,
        widthInch: preset.widthInch,
        gsm: preset.gsm,
        standardWeightKg: preset.standardWeightKg,
        defaultLocation: preset.defaultLocation,
        shade: preset.shade,
        bf: preset.bf,
        paperType: preset.paperType,
        description: preset.description,
        createdById: admin?.id,
      },
    });
  }

  console.log(`✅ Successfully seeded ${defaultStockPresets.length} Stock Item Presets!`);
}

seedStockPresets()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
