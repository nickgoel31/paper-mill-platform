/**
 * WhatsApp Notification Templates for PaperMill ERP.
 * Matches Meta Business Manager registered templates.
 */

export interface OrderDispatchedPayload {
  clientName: string;
  ordersList: string;
  vehicleNumber: string;
  driverName: string;
  driverPhone: string;
  gatePassNumber?: string;
  dispatchedKg: number | string;
  dispatchedAt?: string;
  expectedDate?: string;
  millName?: string;
}

export interface OrderDeliveredPayload {
  clientName: string;
  ordersList: string;
  vehicleNumber: string;
  dispatchNumber?: string;
  deliveredAt?: string;
  millName?: string;
}

export interface OrderConfirmedPayload {
  clientName: string;
  orderNumber: string;
  totalKg: number | string;
  deliveryDate?: string;
  millName?: string;
}

export const WHATSAPP_TEMPLATES = {
  DISPATCH_TRUCK_DEPARTED: "order_dispatched",
  DELIVERY_CONFIRMATION: "order_delivered",
  ORDER_CONFIRMATION: "order_confirmed",
} as const;

export function renderWhatsAppMessage(
  templateName: string,
  payload: Record<string, any>,
  millName: string = "HRA Paper Mill"
): string {
  const normTemplate = templateName.toLowerCase();

  if (normTemplate.includes("dispatch") || normTemplate === "order_dispatched") {
    const p = payload as OrderDispatchedPayload;
    const expDate = p.expectedDate || "within 24-48 hours";
    const weightStr = typeof p.dispatchedKg === "number" ? p.dispatchedKg.toLocaleString("en-IN") : p.dispatchedKg;

    return `Namaste ${p.clientName}, aapka order ${p.ordersList} dispatch ho gaya hai. Truck: ${p.vehicleNumber}, Driver: ${p.driverName} (${p.driverPhone}). Total: ${weightStr} kg. Expected delivery: ${expDate}. - ${p.millName || millName}`;
  }

  if (normTemplate.includes("deliver") || normTemplate === "order_delivered") {
    const p = payload as OrderDeliveredPayload;
    return `Namaste ${p.clientName}, aapka order ${p.ordersList || "consignment"} deliver ho gaya hai. Dhanyavaad! - ${p.millName || millName}`;
  }

  if (normTemplate.includes("confirm") || normTemplate === "order_confirmed") {
    const p = payload as OrderConfirmedPayload;
    const weightStr = typeof p.totalKg === "number" ? p.totalKg.toLocaleString("en-IN") : p.totalKg;
    return `Namaste ${p.clientName}, aapka order ${p.orderNumber} confirm ho gaya hai. Total: ${weightStr} kg. - ${p.millName || millName}`;
  }

  // Generic fallback
  return `Namaste ${payload.clientName || "Customer"}, update from ${millName}: ${JSON.stringify(payload)}`;
}
