import { z } from "zod";
import { LoadStatus } from "@prisma/client";
import { PHONE_REGEX } from "@/lib/constants";

export const loadBatchSchema = z.object({
  truckId: z.string().optional().nullable().or(z.literal("")),
  transporterId: z.string().optional().nullable().or(z.literal("")),
  driverName: z.string().optional().nullable().or(z.literal("")),
  driverPhone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, "Driver phone must be a valid 10-digit Indian number")
    .optional()
    .nullable()
    .or(z.literal("")),
  plannedDispatchDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable(),
  orderIds: z.array(z.string()).min(1, "Please select at least one order for the load batch"),
});

export type LoadBatchInput = z.infer<typeof loadBatchSchema>;
