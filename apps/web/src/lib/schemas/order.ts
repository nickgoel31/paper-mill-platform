import { z } from "zod";
import { OrderPriority, OrderStatus } from "@prisma/client";

export const orderItemSchema = z.object({
  id: z.string().optional(),
  widthInch: z.coerce
    .number()
    .positive("Width must be greater than 0")
    .max(500, "Width cannot exceed 500 inches"),
  gsm: z.coerce
    .number()
    .int("GSM must be an integer")
    .min(40, "GSM must be at least 40")
    .max(600, "GSM cannot exceed 600"),
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
