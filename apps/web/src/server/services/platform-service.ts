"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePlatform } from "@/server/auth-helpers";
import { isPlatformEmail } from "@/lib/platform";
import { revalidatePath } from "next/cache";
import {
  createTenantSchema,
  tenantSchema,
  tenantUserSchema,
  updateTenantUserSchema,
  resetTenantUserPasswordSchema,
  slugify,
  type CreateTenantInput,
  type TenantInput,
  type TenantUserInput,
  type UpdateTenantUserInput,
  type ResetTenantUserPasswordInput,
} from "@/lib/schemas/platform";
import { Role, PostProductionMode, StockStatus, Prisma } from "@/generated/prisma/browser";
import { cookies } from "next/headers";
import { VIEW_AS_COOKIE, createViewAsCookieValue } from "@/lib/view-as";
import { logAudit } from "./audit-service";
import type { FactoryResetCategory } from "@/lib/factory-reset";

/**
 * Platform (TWJ Labs) management of mills and their users.
 *
 * Every query here carries an EXPLICIT tenant filter — the request runs in
 * platform context, where the Prisma isolation extension does not auto-scope.
 */

export async function listTenants() {
  await requirePlatform();
  const tenants = await db.tenant.findMany({ orderBy: { createdAt: "asc" } });
  const counts = await Promise.all(
    tenants.map(async (t) => {
      const [users, orders] = await Promise.all([
        db.user.count({ where: { tenantId: t.id } }),
        db.order.count({ where: { tenantId: t.id } }),
      ]);
      return { id: t.id, users, orders };
    })
  );
  const byId = new Map(counts.map((c) => [c.id, c]));
  return tenants.map((t) => ({
    ...t,
    userCount: byId.get(t.id)?.users ?? 0,
    orderCount: byId.get(t.id)?.orders ?? 0,
  }));
}

export async function getTenant(id: string) {
  await requirePlatform();
  const tenant = await db.tenant.findFirst({ where: { id } });
  if (!tenant) return null;
  const users = await db.user.findMany({
    where: { tenantId: id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return { tenant, users };
}

async function assertCodeSlugFree(code: string, slug: string, exceptId?: string) {
  const clash = await db.tenant.findFirst({
    where: {
      OR: [{ code }, { slug }],
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (clash) {
    throw new Error(
      clash.code === code
        ? `Mill code "${code}" is already in use.`
        : `Mill slug "${slug}" is already in use.`
    );
  }
}

/**
 * Errors thrown from a Server Action are redacted to a generic message in
 * production. Catching here and returning `{ error }` instead of throwing is
 * what actually gets a readable message back to the toast.
 */
export async function createTenant(data: CreateTenantInput) {
  try {
    await requirePlatform();
    const v = createTenantSchema.parse(data);
    const slug = v.slug || slugify(v.name);
    const adminEmail = v.adminEmail.toLowerCase().trim();

    if (isPlatformEmail(adminEmail)) {
      return { error: "A mill admin cannot use a platform (@twjlabs.com) e-mail." };
    }
    await assertCodeSlugFree(v.code, slug);

    const emailTaken = await db.user.findUnique({ where: { email: adminEmail } });
    if (emailTaken) return { error: `E-mail "${adminEmail}" is already registered.` };

    const passwordHash = await bcrypt.hash(v.adminPassword, 10);

    const tenant = await db.tenant.create({
      data: {
        name: v.name.trim(),
        code: v.code,
        slug,
        gstin: v.gstin || null,
        cin: v.cin || null,
        address: v.address || null,
        city: v.city || null,
        state: v.state || null,
        phone: v.phone || null,
        email: v.email || null,
      },
    });

    await db.user.create({
      data: {
        tenantId: tenant.id,
        name: v.adminName.trim(),
        email: adminEmail,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    revalidatePath("/platform");
    return { tenant };
  } catch (err: any) {
    return { error: err?.message || "Failed to create mill." };
  }
}

export async function updateTenant(id: string, data: TenantInput) {
  try {
    await requirePlatform();
    const v = tenantSchema.parse(data);
    const existing = await db.tenant.findFirst({ where: { id } });
    if (!existing) return { error: "Mill not found." };

    const slug = v.slug || slugify(v.name);
    await assertCodeSlugFree(v.code, slug, id);

    const tenant = await db.tenant.update({
      where: { id },
      data: {
        name: v.name.trim(),
        code: v.code,
        slug,
        gstin: v.gstin || null,
        cin: v.cin || null,
        address: v.address || null,
        city: v.city || null,
        state: v.state || null,
        phone: v.phone || null,
        email: v.email || null,
      },
    });

    revalidatePath("/platform");
    revalidatePath(`/platform/mills/${id}`);
    return { tenant };
  } catch (err: any) {
    return { error: err?.message || "Failed to update mill." };
  }
}

export async function updateTenantWhatsAppSettings(
  id: string,
  data: {
    whatsappEnabled: boolean;
    whatsappAccessToken?: string | null;
    whatsappPhoneNumberId?: string | null;
    whatsappApiVersion?: string | null;
  }
) {
  try {
    await requirePlatform();
    const existing = await db.tenant.findFirst({ where: { id } });
    if (!existing) return { error: "Mill not found." };

    if (data.whatsappEnabled && (!data.whatsappAccessToken?.trim() || !data.whatsappPhoneNumberId?.trim())) {
      return { error: "Access Token and Phone Number ID are required to enable WhatsApp for this mill." };
    }

    const tenant = await db.tenant.update({
      where: { id },
      data: {
        whatsappEnabled: data.whatsappEnabled,
        whatsappAccessToken: data.whatsappAccessToken?.trim() || null,
        whatsappPhoneNumberId: data.whatsappPhoneNumberId?.trim() || null,
        whatsappApiVersion: data.whatsappApiVersion?.trim() || null,
      },
    });

    revalidatePath(`/platform/mills/${id}`);
    return { tenant };
  } catch (err: any) {
    return { error: err?.message || "Failed to update WhatsApp settings." };
  }
}

export async function setTenantActive(id: string, isActive: boolean) {
  try {
    await requirePlatform();
    await db.tenant.update({ where: { id }, data: { isActive } });
    revalidatePath("/platform");
    revalidatePath(`/platform/mills/${id}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update mill status." };
  }
}

/** How a mill routes finished reels when a production run completes. */
export async function setTenantPostProductionMode(id: string, mode: PostProductionMode) {
  try {
    const admin = await requirePlatform();
    if (!Object.values(PostProductionMode).includes(mode)) {
      return { success: false, error: "Invalid post-production mode." };
    }
    const existing = await db.tenant.findFirst({ where: { id } });
    if (!existing) return { success: false, error: "Mill not found." };

    await db.tenant.update({ where: { id }, data: { postProductionMode: mode } });
    await logAudit({
      userId: admin.id,
      entityType: "Tenant",
      entityId: id,
      action: "UPDATE_POST_PRODUCTION_MODE",
      before: { postProductionMode: existing.postProductionMode },
      after: { postProductionMode: mode },
    });

    revalidatePath("/platform");
    revalidatePath(`/platform/mills/${id}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update post-production mode." };
  }
}

// ---------------------------------------------------------------------------
// View as mill
// ---------------------------------------------------------------------------

/** Step into a mill's ERP as its admin. Sets the signed "view as mill" cookie. */
export async function enterMill(tenantId: string) {
  const admin = await requirePlatform();
  const tenant = await db.tenant.findFirst({ where: { id: tenantId } });
  if (!tenant) throw new Error("Mill not found.");
  if (!tenant.isActive) throw new Error("This mill is disabled.");

  const jar = await cookies();
  jar.set(VIEW_AS_COOKIE, await createViewAsCookieValue(tenant.id, admin.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  await logAudit({
    userId: admin.id,
    entityType: "Tenant",
    entityId: tenant.id,
    action: "VIEW_AS_MILL",
    after: { mill: tenant.name },
  });
  return { success: true };
}

export async function exitMill() {
  await requirePlatform();
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
  return { success: true };
}

/** Active mills for the "view as mill" switcher. */
export async function listMillsForSwitcher() {
  await requirePlatform();
  const tenants = await db.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true, postProductionMode: true },
    orderBy: { name: "asc" },
  });
  return tenants;
}

// ---------------------------------------------------------------------------
// Mill users
// ---------------------------------------------------------------------------

export async function createTenantUser(tenantId: string, data: TenantUserInput) {
  try {
    await requirePlatform();
    const v = tenantUserSchema.parse(data);
    const email = v.email.toLowerCase().trim();

    const tenant = await db.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) return { success: false, error: "Mill not found." };
    if (isPlatformEmail(email)) {
      return { success: false, error: "This e-mail domain is reserved for platform staff." };
    }

    const taken = await db.user.findUnique({ where: { email } });
    if (taken) return { success: false, error: `E-mail "${email}" is already registered.` };

    const passwordHash = await bcrypt.hash(v.password, 10);
    await db.user.create({
      data: {
        tenantId,
        name: v.name.trim(),
        email,
        passwordHash,
        role: v.role,
        isActive: v.isActive,
      },
    });

    revalidatePath(`/platform/mills/${tenantId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to create staff account." };
  }
}

export async function updateTenantUser(tenantId: string, data: UpdateTenantUserInput) {
  try {
    await requirePlatform();
    const v = updateTenantUserSchema.parse(data);

    const res = await db.user.updateMany({
      where: { id: v.userId, tenantId },
      data: { name: v.name.trim(), role: v.role, isActive: v.isActive },
    });
    if (res.count === 0) return { success: false, error: "User not found in this mill." };

    revalidatePath(`/platform/mills/${tenantId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update staff account." };
  }
}

export async function resetTenantUserPassword(
  tenantId: string,
  data: ResetTenantUserPasswordInput
) {
  try {
    await requirePlatform();
    const v = resetTenantUserPasswordSchema.parse(data);
    const passwordHash = await bcrypt.hash(v.newPassword, 10);

    const res = await db.user.updateMany({
      where: { id: v.userId, tenantId },
      data: { passwordHash },
    });
    if (res.count === 0) return { success: false, error: "User not found in this mill." };

    revalidatePath(`/platform/mills/${tenantId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to reset password." };
  }
}

// -----------------------------------------------------------------------------
// FACTORY RESET — wipe a mill's own transactional data, category by category.
// Masters (Client, Machine, Truck, Transporter, StockPreset, GsmWeightProfile,
// WarehouseLocation, PaperTypeOption), Users, SystemSettings and the Tenant
// row itself are never touched here — this only clears data the mill
// generated day-to-day, so they can start clean without re-configuring the
// mill from scratch.
// -----------------------------------------------------------------------------

export interface FactoryResetInput {
  tenantId: string;
  categories: FactoryResetCategory[];
  /** Must exactly match the mill's own code — the confirmation gate. */
  confirmCode: string;
}

export async function factoryResetTenantData(input: FactoryResetInput) {
  try {
    const admin = await requirePlatform();
    const { tenantId, categories, confirmCode } = input;

    if (!categories || categories.length === 0) {
      return { success: false, error: "Select at least one category to reset." };
    }

    const tenant = await db.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) return { success: false, error: "Mill not found." };

    if (confirmCode?.trim().toUpperCase() !== tenant.code.toUpperCase()) {
      return { success: false, error: `Type the mill code "${tenant.code}" exactly to confirm.` };
    }

    const want = new Set(categories);
    const counts: Record<string, number> = {};

    await db.$transaction(async (tx) => {
      // Dispatch/invoices first — Dispatch must be cleared before LoadBatch
      // (a real DB-level FK RESTRICT blocks deleting a LoadBatch that still
      // has a Dispatch pointing at it).
      if (want.has("dispatch")) {
        counts.invoices = (await tx.invoice.deleteMany({ where: { tenantId } })).count;
        counts.dispatches = (await tx.dispatch.deleteMany({ where: { tenantId } })).count;
        counts.notifications = (await tx.whatsAppNotification.deleteMany({ where: { tenantId } })).count;
        counts.loadBatches = (await tx.loadBatch.deleteMany({ where: { tenantId } })).count;
      }

      if (want.has("production")) {
        counts.wastageLogs = (await tx.wastageLog.deleteMany({ where: { tenantId } })).count;
        counts.productionRuns = (await tx.productionRun.deleteMany({ where: { tenantId } })).count;
      }

      if (want.has("stock")) {
        // Deleting stock without also deleting the orders it was allocated
        // to would otherwise leave OrderItem.producedKg stuck at its old
        // value — showing "produced" progress for reels that no longer
        // exist. Back it out first, unless the orders are being wiped too
        // (in which case this is moot).
        if (!want.has("orders")) {
          const allocated = await tx.stockItem.findMany({
            where: { tenantId, status: StockStatus.ALLOCATED, orderItemId: { not: null } },
            select: { orderItemId: true, quantityKg: true },
          });
          const decrementByItem = new Map<string, number>();
          for (const s of allocated) {
            if (!s.orderItemId) continue;
            decrementByItem.set(s.orderItemId, (decrementByItem.get(s.orderItemId) || 0) + Number(s.quantityKg));
          }
          for (const [orderItemId, kg] of decrementByItem) {
            const item = await tx.orderItem.findFirst({ where: { id: orderItemId }, select: { producedKg: true } });
            if (!item) continue;
            const newProduced = Math.max(0, Number(item.producedKg) - kg);
            await tx.orderItem.update({
              where: { id: orderItemId },
              data: { producedKg: new Prisma.Decimal(newProduced.toFixed(3)) },
            });
          }
        }
        counts.stockItems = (await tx.stockItem.deleteMany({ where: { tenantId } })).count;
      }

      if (want.has("orders")) {
        counts.orders = (await tx.order.deleteMany({ where: { tenantId } })).count;
      }

      if (want.has("auditLogs")) {
        counts.auditLogs = (await tx.auditLog.deleteMany({ where: { tenantId } })).count;
      }

      // Log the reset itself — after the AuditLog wipe (if selected) so this
      // entry survives as the record of what just happened.
      await logAudit(
        {
          userId: admin.id,
          entityType: "Tenant",
          entityId: tenantId,
          action: "FACTORY_RESET",
          before: { categories, millCode: tenant.code },
          after: { counts },
        },
        tx
      );
    });

    revalidatePath("/platform");
    revalidatePath(`/platform/mills/${tenantId}`);
    revalidatePath("/orders");
    revalidatePath("/stock");
    revalidatePath("/dispatch");
    revalidatePath("/production");
    revalidatePath("/deckle");
    revalidatePath("/invoices");
    revalidatePath("/logs");

    return { success: true, counts };
  } catch (err: any) {
    return { success: false, error: err?.message || "Factory reset failed." };
  }
}
