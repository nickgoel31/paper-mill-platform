"use client";

/**
 * Central registry of offline-aware wrappers around server actions.
 *
 * This module (not the individual screens) must be the one imported for its
 * side effects from the root layout, so every wrapped action registers
 * itself with the sync engine on first paint of *any* route — not only once
 * the user happens to visit the specific screen that uses it. Otherwise a
 * mutation queued from /operator/run/[id] before a reload could land on a
 * reload landing on /operator and find no handler registered yet.
 *
 * Screens import the `offline*` functions below instead of calling the raw
 * "use server" exports directly.
 */
import {
  updatePatternProgress,
  startProductionRun,
  completeProductionRun,
  floorStartRun,
  floorCompleteRun,
} from "@/server/services/production-service";
import { createManualWastageLog } from "@/server/services/wastage-service";
import {
  createOrder,
  updateOrder,
  getOrders,
  getOrderSummaryStats,
  transitionOrderStatus,
} from "@/server/services/order-service";
import { createOfflineReadAction, createOfflineWriteAction } from "./action-wrapper";

export const offlineUpdatePatternProgress = createOfflineWriteAction(updatePatternProgress, {
  entity: "ProductionRun",
  actionName: "production.updatePatternProgress",
});

export const offlineStartProductionRun = createOfflineWriteAction(startProductionRun, {
  entity: "ProductionRun",
  actionName: "production.startProductionRun",
});

export const offlineCompleteProductionRun = createOfflineWriteAction(completeProductionRun, {
  entity: "ProductionRun",
  actionName: "production.completeProductionRun",
});

// Floor tablet: the only two actions an operator has (start, complete + feedback).
export const offlineFloorStartRun = createOfflineWriteAction(floorStartRun, {
  entity: "ProductionRun",
  actionName: "production.floorStartRun",
});

export const offlineFloorCompleteRun = createOfflineWriteAction(floorCompleteRun, {
  entity: "ProductionRun",
  actionName: "production.floorCompleteRun",
});

export const offlineCreateManualWastageLog = createOfflineWriteAction(createManualWastageLog, {
  entity: "WastageLog",
  actionName: "wastage.createManualWastageLog",
});

export const offlineCreateOrder = createOfflineWriteAction(createOrder, {
  entity: "Order",
  actionName: "order.createOrder",
});

export const offlineUpdateOrder = createOfflineWriteAction(updateOrder, {
  entity: "Order",
  actionName: "order.updateOrder",
});

export const offlineTransitionOrderStatus = createOfflineWriteAction(transitionOrderStatus, {
  entity: "Order",
  actionName: "order.transitionOrderStatus",
});

export const offlineGetOrders = createOfflineReadAction(getOrders, {
  cacheKey: (params) => `orders:${JSON.stringify(params ?? {})}`,
});

export const offlineGetOrderSummaryStats = createOfflineReadAction(getOrderSummaryStats, {
  cacheKey: () => "order-summary-stats",
});
