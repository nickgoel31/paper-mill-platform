import { z } from "zod";
import { GSTIN_REGEX, PHONE_REGEX } from "@/lib/constants";

// Indian vehicle registration number format e.g. GJ01AB1234, MH04CD5678, DL01EF9012, UP14AB1234
const VEHICLE_REG_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;

export const transporterSchema = z.object({
  name: z.string().min(2, "Transporter name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, "Phone must be a valid 10-digit Indian mobile number"),
  gstin: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v.toUpperCase()))
    .pipe(
      z
        .string()
        .regex(GSTIN_REGEX, "Invalid Indian GSTIN format (e.g. 24AABCA1234F1Z5)")
        .optional()
    ),
  isActive: z.boolean().default(true),
});

export const truckSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/[\s-]/g, ""))
    .pipe(
      z
        .string()
        .regex(
          VEHICLE_REG_REGEX,
          "Invalid Indian vehicle registration format (e.g. GJ01AB1234, UP14AB1234)"
        )
    ),
  capacityKg: z.coerce
    .number()
    .int("Capacity must be an integer (in kg)")
    .min(1000, "Truck capacity must be at least 1,000 kg (1 MT)")
    .max(100000, "Truck capacity cannot exceed 100,000 kg (100 MT)"),
  transporterId: z.string().optional().nullable().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export type TransporterFormInput = z.infer<typeof transporterSchema>;
export type TruckFormInput = z.infer<typeof truckSchema>;
