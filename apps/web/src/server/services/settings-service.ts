"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

export interface SystemSettingsMap {
  millName: string;
  millAddress: string;
  millGstin: string;
  millState: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  defaultGstRate: number;
  trimPercentTarget: number;
  contactEmail: string;
  contactPhone: string;
}

const DEFAULT_SETTINGS: SystemSettingsMap = {
  millName: "HRA Paper Mill Private Limited",
  millAddress: "Plot No. 45-48, Industrial Growth Area, Jaipur, Rajasthan - 302013",
  millGstin: "08AAAAH1234F1Z5",
  millState: "Rajasthan",
  bankName: "HDFC Bank Ltd",
  bankAccountName: "HRA Paper Mill Private Limited",
  bankAccountNumber: "50200088991122",
  bankIfsc: "HDFC0001234",
  defaultGstRate: 18.0,
  trimPercentTarget: 3.0,
  contactEmail: "accounts@papermill.local",
  contactPhone: "+91 141 2789100",
};

export async function getSystemSettings(): Promise<SystemSettingsMap> {
  const rows = await db.systemSetting.findMany();
  const map = { ...DEFAULT_SETTINGS };

  rows.forEach((r) => {
    if (r.key in map) {
      if (r.key === "defaultGstRate" || r.key === "trimPercentTarget") {
        (map as any)[r.key] = parseFloat(r.value) || (DEFAULT_SETTINGS as any)[r.key];
      } else {
        (map as any)[r.key] = r.value;
      }
    }
  });

  return map;
}

export async function updateSystemSettings(settings: Partial<SystemSettingsMap>) {
  await requireRole(Role.ADMIN);

  const updates = Object.entries(settings).map(([key, val]) => {
    const valStr = String(val);
    return db.systemSetting.upsert({
      where: { key },
      create: { key, value: valStr },
      update: { value: valStr },
    });
  });

  await db.$transaction(updates);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
  return getSystemSettings();
}
