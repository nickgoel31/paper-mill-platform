import { z } from "zod";
import { Role } from "@/generated/prisma/browser";

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const tenantSchema = z.object({
  name: z.string().min(2, "Mill name is required"),
  code: z
    .string()
    .min(2, "Code is required")
    .max(12, "Code must be 12 characters or fewer")
    .transform((s) => s.trim().toUpperCase()),
  slug: z
    .string()
    .optional()
    .transform((s) => (s ? slugify(s) : "")),
  gstin: z.string().trim().optional().nullable(),
  cin: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  state: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

export const createTenantSchema = tenantSchema.extend({
  adminName: z.string().min(2, "Admin name is required"),
  adminEmail: z.string().email("Invalid admin email"),
  adminPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export const tenantUserSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.nativeEnum(Role),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isActive: z.boolean().default(true),
});

export const updateTenantUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(2, "Name is required"),
  role: z.nativeEnum(Role),
  isActive: z.boolean().default(true),
});

export const resetTenantUserPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export type TenantInput = z.infer<typeof tenantSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type TenantUserInput = z.infer<typeof tenantUserSchema>;
export type UpdateTenantUserInput = z.infer<typeof updateTenantUserSchema>;
export type ResetTenantUserPasswordInput = z.infer<typeof resetTenantUserPasswordSchema>;

export { slugify };
