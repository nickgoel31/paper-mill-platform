"use server";

import { db } from "@/lib/db";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
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
  /** Unit widths are displayed in across the app, unless overridden (e.g. run cards). */
  measurementUnit: "INCH" | "CM";
  /** Prefix for auto-generated stock reel numbers, e.g. "REEL" -> REEL-2609-0001. */
  reelNumberPrefix: string;
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
  measurementUnit: "INCH",
  reelNumberPrefix: "REEL",
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
  const { tenantId } = await requireRole(Role.ADMIN);

  // SystemSetting is unique on (tenantId, key); do an explicit update-or-insert
  // per key rather than an upsert with a compound-unique selector.
  for (const [key, val] of Object.entries(settings)) {
    const value = String(val);
    const res = await db.systemSetting.updateMany({
      where: { tenantId: tenantId!, key },
      data: { value },
    });
    if (res.count === 0) {
      await db.systemSetting.create({ data: { tenantId: tenantId!, key, value } });
    }
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
  return getSystemSettings();
}
