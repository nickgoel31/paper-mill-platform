import { z } from "zod";
import { GSTIN_REGEX, PINCODE_REGEX, PHONE_REGEX, INDIAN_STATES } from "@/lib/constants";

export const clientSchema = z.object({
  name: z.string().min(2, "Client name must be at least 2 characters"),
  code: z
    .string()
    .min(2, "Client code must be at least 2 characters")
    .max(20, "Client code must be at most 20 characters")
    .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase alphanumeric (e.g. AMBER-01)"),
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
  addressLine1: z.string().min(3, "Address line 1 is required"),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(2, "City is required"),
  state: z.enum(INDIAN_STATES as unknown as [string, ...string[]], {
    required_error: "Please select an Indian state",
  }),
  pincode: z.string().regex(PINCODE_REGEX, "PIN code must be a 6-digit number"),
  contactPerson: z.string().optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, "Phone must be a valid 10-digit Indian mobile number"),
  whatsappNumber: z
    .string()
    .trim()
    .min(10, "WhatsApp number must be at least 10 digits"),
  email: z.string().email("Invalid email address").optional().nullable().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export type ClientFormInput = z.infer<typeof clientSchema>;
