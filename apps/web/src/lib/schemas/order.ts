import { z } from "zod";
import { OrderPriority, OrderStatus, PaperSize, LengthUnit } from "@/generated/prisma/browser";

export const orderItemSchema = z.object({
  id: z.string().optional(),
  // A booking taken with just a weight — no size/reels known yet (e.g. an
  // offline phone/diary booking). Relaxes the width/GSM requirements below;
  // the line is excluded from deckle planning until it's edited with real
  // dimensions.
  isBookingOnly: z.boolean().default(false),
  // The value exactly as typed, in `widthUnit` below. Converted to canonical
  // inches (and validated against machine deckle) server-side in order-service.
  // Relaxed to allow 0 for a booking-only line — enforced >0 in the refine below.
  widthInch: z.coerce
    .number()
    .min(0, "Width cannot be negative")
    .max(1300, "Width is out of range"),
  widthUnit: z.nativeEnum(LengthUnit).default(LengthUnit.INCH),
  gsm: z.coerce
    .number()
    .int("GSM must be an integer")
    .min(0)
    .max(600, "GSM cannot exceed 600"),
  // Mill-configurable (Masters → Paper Types) — no longer a fixed enum.
  paperType: z.string().min(1, "Paper type is required").default("NATURAL"),
  size: z.nativeEnum(PaperSize).default(PaperSize.NORMAL),
  // Burst Factor — purely informational/commercial, not used by the deckle
  // solver. Blank ("" from an untouched/cleared input) falls back to 18, the
  // mill's most common grade.
  bf: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 18 : v),
    z.coerce.number().int("BF must be a whole number").min(1, "BF must be at least 1").max(99, "BF is out of range")
  ).default(18),
  numberOfReels: z.coerce
    .number()
    .int("Reel count must be a whole number")
    .min(0, "Reel count cannot be negative")
    .max(100000, "Reel count too large")
    .optional()
    .nullable(),
  remark: z
    .string()
    .max(500, "Remark cannot exceed 500 characters")
    .trim()
    .optional()
    .nullable(),
  quantityKg: z.coerce
    .number()
    .positive("Quantity must be greater than 0")
    .max(1000000, "Quantity cannot exceed 1,000 MT"),
  tolerancePercent: z.coerce
    .number()
    .min(0, "Tolerance cannot be negative")
    .max(20, "Tolerance cannot exceed 20%")
    .default(5.0),
  ratePerKg: z.coerce
    .number()
    .min(0, "Rate per kg cannot be negative")
    .optional()
    .nullable(),
  // This party's own kg/inch for this GSM, overriding the mill's GSM Weight
  // Chart default just for this order line. Blank ("" from the input) means
  // "use the mill's chart" — same normalize-then-coerce trick as deliveryDate.
  kgPerInchOverride: z.preprocess(
    (v) => (v === "" ? null : v),
    z.coerce.number().positive("kg/inch must be greater than 0").optional().nullable()
  ),
  // Manually typed total for this line (₹). Not derived from quantity × rate —
  // the mill enters the commercial amount they've agreed with the client
  // directly. `ratePerKg` above is back-computed from this for storage/invoicing.
  amount: z.coerce
    .number()
    .min(0, "Amount cannot be negative")
    .optional()
    .nullable(),
}).superRefine((item, ctx) => {
  // A booking-only line has no size/reel yet — everything else about it
  // (weight, remark, commercials) is still fully required as normal.
  if (item.isBookingOnly) return;
  if (!(item.widthInch > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Width must be greater than 0", path: ["widthInch"] });
  }
  if (item.gsm < 40) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GSM must be at least 40", path: ["gsm"] });
  }
});

export const orderFormSchema = z
  .object({
    clientId: z.string().min(1, "Please select a client"),
    // The system's own order number. Leave blank to auto-generate
    // "SO-YYMM-0001" as before; provide one to use it instead (e.g. to match
    // a legacy/offline numbering scheme) — uniqueness is enforced server-side.
    orderNumber: z.string().max(40, "Too long").trim().optional().nullable(),
    // The client's own PO/booking reference — optional, purely for matching
    // an offline booking to this system order.
    offlineOrderNo: z.string().max(100, "Too long").trim().optional().nullable(),
    orderDate: z.coerce.date({ required_error: "Order date is required" }),
    // Optional — an untouched/cleared date input submits "" (from the <input
    // type="date">'s empty string), which z.coerce.date() would otherwise
    // reject as an invalid date. Normalize "" to null first so leaving it
    // blank actually validates as "no delivery date" instead of erroring.
    deliveryDate: z.preprocess(
      (v) => (v === "" ? null : v),
      z.coerce.date().optional().nullable()
    ),
    priority: z.nativeEnum(OrderPriority).default(OrderPriority.NORMAL),
    notes: z.string().optional().nullable(),
    otherNotes: z
      .string()
      .max(1000, "Other notes cannot exceed 1000 characters")
      .optional()
      .nullable(),
    items: z
      .array(orderItemSchema)
      .min(1, "An order must contain at least one line item"),
  })
  .refine(
    (data) => {
      if (data.deliveryDate && data.orderDate) {
        const orderD = new Date(data.orderDate).setHours(0, 0, 0, 0);
        const delivD = new Date(data.deliveryDate).setHours(0, 0, 0, 0);
        return delivD >= orderD;
      }
      return true;
    },
    {
      message: "Delivery date must be on or after order date",
      path: ["deliveryDate"],
    }
  );

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderFormInput = z.infer<typeof orderFormSchema>;

export const statusTransitionSchema = z.object({
  orderId: z.string().min(1),
  newStatus: z.nativeEnum(OrderStatus),
  reason: z.string().optional(),
});

export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;
