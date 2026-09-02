import { z } from "zod";

export const machineSchema = z
  .object({
    name: z.string().min(2, "Machine name must be at least 2 characters"),
    code: z
      .string()
      .min(1, "Machine code is required")
      .max(10, "Code must be at most 10 characters")
      .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase alphanumeric (e.g. M1, M2, M3)"),
    maxDeckleInch: z.coerce
      .number()
      .positive("Max deckle width must be greater than 0")
      .max(500, "Max deckle cannot exceed 500 inches"),
    minDeckleInch: z.coerce
      .number()
      .positive("Min deckle width must be greater than 0"),
    minTrimInch: z.coerce
      .number()
      .min(0, "Min edge trim cannot be negative"),
    maxTrimInch: z.coerce
      .number()
      .positive("Max trim waste allowance must be greater than 0"),
    minGsm: z.coerce
      .number()
      .int("Min GSM must be an integer")
      .min(40, "Min GSM must be at least 40")
      .max(600, "Min GSM cannot exceed 600"),
    maxGsm: z.coerce
      .number()
      .int("Max GSM must be an integer")
      .min(40, "Max GSM must be at least 40")
      .max(600, "Max GSM cannot exceed 600"),
    speedMpm: z.coerce
      .number()
      .int("Speed must be an integer")
      .positive("Speed must be positive")
      .optional()
      .nullable(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.maxDeckleInch > data.minDeckleInch, {
    message: "Max Deckle width must be strictly greater than Min Deckle width.",
    path: ["maxDeckleInch"],
  })
  .refine((data) => data.maxTrimInch > data.minTrimInch, {
    message: "Max Trim boundary must be strictly greater than Min Trim margin.",
    path: ["maxTrimInch"],
  })
  .refine((data) => data.maxGsm >= data.minGsm, {
    message: "Max GSM must be greater than or equal to Min GSM.",
    path: ["maxGsm"],
  });

export type MachineFormInput = z.infer<typeof machineSchema>;
