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
import { Role } from "@/generated/prisma/browser";

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

export async function createTenant(data: CreateTenantInput) {
  await requirePlatform();
  const v = createTenantSchema.parse(data);
  const slug = v.slug || slugify(v.name);
  const adminEmail = v.adminEmail.toLowerCase().trim();

  if (isPlatformEmail(adminEmail)) {
    throw new Error("A mill admin cannot use a platform (@twjlabs.com) e-mail.");
  }
  await assertCodeSlugFree(v.code, slug);

  const emailTaken = await db.user.findUnique({ where: { email: adminEmail } });
  if (emailTaken) throw new Error(`E-mail "${adminEmail}" is already registered.`);

  const passwordHash = await bcrypt.hash(v.adminPassword, 10);

  const tenant = await db.tenant.create({
    data: {
      name: v.name.trim(),
      code: v.code,
      slug,
      gstin: v.gstin || null,
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
  return tenant;
}

export async function updateTenant(id: string, data: TenantInput) {
  await requirePlatform();
  const v = tenantSchema.parse(data);
  const existing = await db.tenant.findFirst({ where: { id } });
  if (!existing) throw new Error("Mill not found.");

  const slug = v.slug || slugify(v.name);
  await assertCodeSlugFree(v.code, slug, id);

  const tenant = await db.tenant.update({
    where: { id },
    data: {
      name: v.name.trim(),
      code: v.code,
      slug,
      gstin: v.gstin || null,
      address: v.address || null,
      city: v.city || null,
      state: v.state || null,
      phone: v.phone || null,
      email: v.email || null,
    },
  });

  revalidatePath("/platform");
  revalidatePath(`/platform/mills/${id}`);
  return tenant;
}

export async function setTenantActive(id: string, isActive: boolean) {
  await requirePlatform();
  await db.tenant.update({ where: { id }, data: { isActive } });
  revalidatePath("/platform");
  revalidatePath(`/platform/mills/${id}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mill users
// ---------------------------------------------------------------------------

export async function createTenantUser(tenantId: string, data: TenantUserInput) {
  await requirePlatform();
  const v = tenantUserSchema.parse(data);
  const email = v.email.toLowerCase().trim();

  const tenant = await db.tenant.findFirst({ where: { id: tenantId } });
  if (!tenant) throw new Error("Mill not found.");
  if (isPlatformEmail(email)) {
    throw new Error("This e-mail domain is reserved for platform staff.");
  }

  const taken = await db.user.findUnique({ where: { email } });
  if (taken) throw new Error(`E-mail "${email}" is already registered.`);

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
}

export async function updateTenantUser(tenantId: string, data: UpdateTenantUserInput) {
  await requirePlatform();
  const v = updateTenantUserSchema.parse(data);

  const res = await db.user.updateMany({
    where: { id: v.userId, tenantId },
    data: { name: v.name.trim(), role: v.role, isActive: v.isActive },
  });
  if (res.count === 0) throw new Error("User not found in this mill.");

  revalidatePath(`/platform/mills/${tenantId}`);
  return { success: true };
}

export async function resetTenantUserPassword(
  tenantId: string,
  data: ResetTenantUserPasswordInput
) {
  await requirePlatform();
  const v = resetTenantUserPasswordSchema.parse(data);
  const passwordHash = await bcrypt.hash(v.newPassword, 10);

  const res = await db.user.updateMany({
    where: { id: v.userId, tenantId },
    data: { passwordHash },
  });
  if (res.count === 0) throw new Error("User not found in this mill.");

  revalidatePath(`/platform/mills/${tenantId}`);
  return { success: true };
}
