import { z } from "zod";
import { OrderPriority, OrderStatus, PaperType, PaperSize, LengthUnit } from "@/generated/prisma/browser";

export const orderItemSchema = z.object({
  id: z.string().optional(),
  // The value exactly as typed, in `widthUnit` below. Converted to canonical
  // inches (and validated against machine deckle) server-side in order-service.
  widthInch: z.coerce
    .number()
    .positive("Width must be greater than 0")
    .max(1300, "Width is out of range"),
  widthUnit: z.nativeEnum(LengthUnit).default(LengthUnit.INCH),
  gsm: z.coerce
    .number()
    .int("GSM must be an integer")
    .min(40, "GSM must be at least 40")
    .max(600, "GSM cannot exceed 600"),
  paperType: z.nativeEnum(PaperType).default(PaperType.NATURAL),
  size: z.nativeEnum(PaperSize).default(PaperSize.NORMAL),
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
});

export const orderFormSchema = z
  .object({
    clientId: z.string().min(1, "Please select a client"),
    orderDate: z.coerce.date({ required_error: "Order date is required" }),
    deliveryDate: z.coerce.date().optional().nullable(),
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
