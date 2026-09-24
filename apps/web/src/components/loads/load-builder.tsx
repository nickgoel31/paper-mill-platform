"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { formatWeightKg } from "@/lib/utils";
import { createLoadBatch } from "@/server/services/load-batch-service";
import { createTruck } from "@/server/services/truck-service";
import { suggestRouteGroups, RouteGroupSuggestion } from "@/server/services/route-match-service";
import { OrderPriority, OrderStatus } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Truck,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Building,
  MapPin,
  Sparkles,
  Layers,
  Phone,
  User,
  Loader2,
  Info,
  CheckCircle2,
  ChevronsUpDown,
  Check,
  Search,
} from "lucide-react";

interface UnassignedOrder {
  id: string;
  orderNumber: string;
  deliveryDate: Date | string | null;
  priority: OrderPriority;
  status: OrderStatus;
  totalKg: number;
  distinctGsms: number[];
  client: {
    id: string;
    name: string;
    code: string;
    city: string;
    state: string;
    pincode: string;
    whatsappNumber: string;
  };
}

interface TruckOption {
  id: string;
  registrationNumber: string;
  capacityKg: number;
  transporterId: string | null;
}

interface TransporterOption {
  id: string;
  name: string;
  phone: string;
}

interface LoadBuilderProps {
  unassignedOrders: UnassignedOrder[];
  trucks: TruckOption[];
  transporters: TransporterOption[];
}

export function LoadBuilder({
  unassignedOrders,
  trucks,
  transporters,
}: LoadBuilderProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Truck list starts from the server-loaded options but grows in place when
  // a truck is added inline from the picker below, without a page refresh.
  const [truckList, setTruckList] = React.useState<TruckOption[]>(trucks);

  // Right Panel State (This Load)
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<string[]>([]);
  const [selectedTruckId, setSelectedTruckId] = React.useState<string>(truckList[0]?.id || "");
  const [selectedTransporterId, setSelectedTransporterId] = React.useState<string>(
    truckList[0]?.transporterId || transporters[0]?.id || ""
  );
  const [driverName, setDriverName] = React.useState("");
  const [driverPhone, setDriverPhone] = React.useState("");
  const [plannedDate, setPlannedDate] = React.useState<string>(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [notes, setNotes] = React.useState("");

  // Left Panel Filters
  const [searchFilter, setSearchFilter] = React.useState("");
  const [cityFilter, setCityFilter] = React.useState("ALL");
  const [priorityFilter, setPriorityFilter] = React.useState("ALL");
  const [sortBy, setSortBy] = React.useState<"date" | "weight">("date");

  // AI-assisted route grouping — clusters unassigned orders by destination
  // city/pincode proximity so the planner can bundle a whole route onto one
  // truck in one click, instead of eyeballing city names one at a time.
  const [routeGroups, setRouteGroups] = React.useState<RouteGroupSuggestion[] | null>(null);
  const [isSuggestingRoutes, setIsSuggestingRoutes] = React.useState(false);

  // Selected Truck Details
  const activeTruck = truckList.find((t) => t.id === selectedTruckId);
  const truckCapacity = activeTruck ? activeTruck.capacityKg : 0;

  // Selected Orders Objects
  const selectedOrders = React.useMemo(() => {
    return unassignedOrders.filter((o) => selectedOrderIds.includes(o.id));
  }, [unassignedOrders, selectedOrderIds]);

  // Unselected Orders Objects
  const availableOrders = React.useMemo(() => {
    return unassignedOrders.filter((o) => !selectedOrderIds.includes(o.id));
  }, [unassignedOrders, selectedOrderIds]);

  // Destination cities and states of selected orders for route recommendation
  const selectedDestinations = React.useMemo(() => {
    const cities = new Set(selectedOrders.map((o) => o.client.city.toLowerCase()));
    const states = new Set(selectedOrders.map((o) => o.client.state.toLowerCase()));
    return { cities, states };
  }, [selectedOrders]);

  // Left panel filtered & sorted list
  const filteredAvailableOrders = React.useMemo(() => {
    let list = [...availableOrders];

    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.client.name.toLowerCase().includes(q) ||
          o.client.code.toLowerCase().includes(q) ||
          o.client.city.toLowerCase().includes(q)
      );
    }

    if (cityFilter !== "ALL") {
      list = list.filter((o) => o.client.city === cityFilter);
    }

    if (priorityFilter !== "ALL") {
      list = list.filter((o) => o.priority === priorityFilter);
    }

    // Sort: Route proximity first if items selected, then date or weight
    list.sort((a, b) => {
      const aSameRoute =
        selectedDestinations.cities.has(a.client.city.toLowerCase()) ||
        selectedDestinations.states.has(a.client.state.toLowerCase());
      const bSameRoute =
        selectedDestinations.cities.has(b.client.city.toLowerCase()) ||
        selectedDestinations.states.has(b.client.state.toLowerCase());

      if (selectedOrders.length > 0 && aSameRoute !== bSameRoute) {
        return aSameRoute ? -1 : 1;
      }

      if (sortBy === "weight") {
        return b.totalKg - a.totalKg;
      } else {
        const da = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Infinity;
        const db = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Infinity;
        return da - db;
      }
    });

    return list;
  }, [availableOrders, searchFilter, cityFilter, priorityFilter, sortBy, selectedDestinations, selectedOrders.length]);

  // Right Panel Calculations
  const currentTotalKg = selectedOrders.reduce((acc, o) => acc + o.totalKg, 0);
  const capacityPct = truckCapacity > 0 ? Math.round((currentTotalKg / truckCapacity) * 100) : 0;
  const isOverCapacity = truckCapacity > 0 && currentTotalKg > truckCapacity;
  const overKg = Math.max(0, currentTotalKg - truckCapacity);

  const distinctClients = Array.from(new Set(selectedOrders.map((o) => o.client.id)));
  const distinctCities = Array.from(new Set(selectedOrders.map((o) => o.client.city)));

  // Advisory Warnings
  const warnings = React.useMemo(() => {
    const list: string[] = [];
    if (selectedOrders.length > 1) {
      const dates = selectedOrders
        .map((o) => (o.deliveryDate ? new Date(o.deliveryDate).getTime() : null))
        .filter(Boolean) as number[];
      if (dates.length > 1) {
        const minD = Math.min(...dates);
        const maxD = Math.max(...dates);
        const diffDays = Math.round((maxD - minD) / (1000 * 60 * 60 * 24));
        if (diffDays > 7) {
          list.push(
            `Delivery dates vary widely by ${diffDays} days across selected orders. Consider separating into different truck schedules.`
          );
        }
      }
    }

    if (plannedDate) {
      const pDate = new Date(plannedDate).getTime();
      const earlyOrders = selectedOrders.filter(
        (o) => o.deliveryDate && new Date(o.deliveryDate).getTime() < pDate
      );
      if (earlyOrders.length > 0) {
        list.push(
          `${earlyOrders.length} order(s) have delivery dates before the planned dispatch date (${new Date(
            plannedDate
          ).toLocaleDateString("en-IN")}).`
        );
      }
    }

    return list;
  }, [selectedOrders, plannedDate]);

  // Add Order Handler
  const handleAddOrder = (order: UnassignedOrder) => {
    if (truckCapacity > 0 && currentTotalKg + order.totalKg > truckCapacity) {
      const prospectiveOver = currentTotalKg + order.totalKg - truckCapacity;
      toast.error(
        `Cannot add order #${order.orderNumber}. Adding ${(order.totalKg / 1000).toFixed(
          2
        )} MT would exceed truck capacity by ${(prospectiveOver / 1000).toFixed(2)} MT.`
      );
      return;
    }
    setSelectedOrderIds((prev) => [...prev, order.id]);
  };

  // Remove Order Handler
  const handleRemoveOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => prev.filter((id) => id !== orderId));
  };

  // AI Route Grouping — clusters currently-unassigned orders by destination
  const handleSuggestRoutes = async () => {
    if (availableOrders.length === 0) {
      toast.error("No unassigned orders to group.");
      return;
    }
    setIsSuggestingRoutes(true);
    try {
      const result = await suggestRouteGroups(
        availableOrders.map((o) => ({
          orderId: o.id,
          orderNumber: o.orderNumber,
          clientName: o.client.name,
          city: o.client.city,
          state: o.client.state,
          pincode: o.client.pincode,
          totalKg: o.totalKg,
        }))
      );
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setRouteGroups(result.groups);
      toast.success(`${result.groups.length} route group(s) suggested.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to suggest route groups");
    } finally {
      setIsSuggestingRoutes(false);
    }
  };

  // Adds every order in a suggested route group to the current load, skipping
  // any that would blow the truck capacity (already-selected orders excluded).
  const handleUseRouteGroup = (group: RouteGroupSuggestion) => {
    const idsToAdd = group.orderIds.filter((id) => !selectedOrderIds.includes(id));
    let runningKg = currentTotalKg;
    const accepted: string[] = [];
    const skipped: string[] = [];
    for (const id of idsToAdd) {
      const order = unassignedOrders.find((o) => o.id === id);
      if (!order) continue;
      if (truckCapacity > 0 && runningKg + order.totalKg > truckCapacity) {
        skipped.push(order.orderNumber);
        continue;
      }
      runningKg += order.totalKg;
      accepted.push(id);
    }
    if (accepted.length > 0) {
      setSelectedOrderIds((prev) => [...prev, ...accepted]);
    }
    if (skipped.length > 0) {
      toast.warning(
        `Added ${accepted.length} order(s); skipped ${skipped.length} (${skipped.join(", ")}) — would exceed truck capacity.`
      );
    } else if (accepted.length > 0) {
      toast.success(`Added ${accepted.length} order(s) from "${group.label}" to this load.`);
    }
  };

  // Save Batch Handler
  const handleSaveBatch = async () => {
    if (selectedOrderIds.length === 0) {
      toast.error("Please add at least one order to the load batch.");
      return;
    }

    if (isOverCapacity) {
      toast.error(`Cannot save: Load exceeds truck capacity by ${(overKg / 1000).toFixed(2)} MT.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createLoadBatch({
        truckId: selectedTruckId || null,
        transporterId: selectedTransporterId || null,
        driverName: driverName || null,
        driverPhone: driverPhone || null,
        plannedDispatchDate: plannedDate ? new Date(plannedDate) : null,
        notes: notes || null,
        orderIds: selectedOrderIds,
      });

      if ("error" in created) {
        toast.error(created.error);
        return;
      }

      toast.success(`Load Batch #${created.batchNumber} created successfully!`);
      router.push(`/loads/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create load batch");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get distinct cities for left filter
  const allAvailableCities = Array.from(
    new Set(unassignedOrders.map((o) => o.client.city).filter(Boolean))
  );

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-white rounded-[26px] p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            LOGISTICS & DISPATCH • LOAD BUILDER
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Truck className="h-7 w-7 text-sky-500" />
            Build Truck Load Batch
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Consolidate confirmed customer orders travelling in the same direction onto one vehicle with live capacity monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" className="h-10 px-4 rounded-xl bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-bold text-xs shadow-xs">
            <Link href="/loads">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Load Batches
            </Link>
          </Button>
        </div>
      </div>

      {/* Two-Panel Layout (Tablet & Desktop Optimized) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================================= */}
        {/* LEFT PANEL: Unassigned Orders (5 Columns) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="rounded-[26px] border border-slate-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sky-500" />
                  Unassigned Active Orders ({availableOrders.length})
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Select confirmed, in-production, or produced orders to assign to this truck load.
                </CardDescription>
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-semibold">Sort:</span>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="h-7 text-xs w-24 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date" className="text-xs">Due Date</SelectItem>
                    <SelectItem value="weight" className="text-xs">Weight</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent className="p-3 space-y-3">
              {/* Left Panel Search & Filters */}
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Search order #, client..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-8 text-xs bg-white"
                />

                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="h-8 text-xs bg-white">
                    <SelectValue placeholder="All Cities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs">All Cities</SelectItem>
                    {allAvailableCities.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AI Route Grouping */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSuggestRoutes}
                  disabled={isSuggestingRoutes}
                  className="h-8 w-full text-xs font-bold gap-1.5 rounded-lg border-sky-200 text-sky-700 hover:bg-sky-50"
                >
                  {isSuggestingRoutes ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Suggest Truck Routes (AI) — by city & pincode
                </Button>

                {routeGroups && routeGroups.length > 0 && (
                  <div className="space-y-1.5 p-2 rounded-lg bg-sky-50/60 border border-sky-100">
                    {routeGroups.map((g, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 bg-white rounded-md border border-sky-100 px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-slate-900 truncate">{g.label}</div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {g.orderIds.length} order(s) • {formatWeightKg(g.totalKg)} • {g.reason}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleUseRouteGroup(g)}
                          className="h-7 px-2.5 text-[11px] rounded-lg shrink-0 bg-sky-600 hover:bg-sky-700 text-white"
                        >
                          Use
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Orders List Container */}
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {filteredAvailableOrders.length === 0 ? (
                  <div className="p-8 text-center border border-dashed rounded-lg text-muted-foreground text-xs">
                    No matching unassigned orders available.
                  </div>
                ) : (
                  filteredAvailableOrders.map((order) => {
                    const isSameRoute =
                      selectedOrders.length > 0 &&
                      (selectedDestinations.cities.has(order.client.city.toLowerCase()) ||
                        selectedDestinations.states.has(order.client.state.toLowerCase()));

                    const daysUntil = order.deliveryDate
                      ? Math.round(
                          (new Date(order.deliveryDate).getTime() - Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : null;

                    return (
                      <div
                        key={order.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isSameRoute
                            ? "bg-blue-50/50 border-blue-200"
                            : "bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-xs text-primary">
                                {order.orderNumber}
                              </span>
                              <Badge variant="outline" className="text-[10px] py-0 font-mono">
                                {order.status}
                              </Badge>
                              {isSameRoute && (
                                <Badge className="bg-blue-600 text-white text-[9px] py-0 gap-1">
                                  <Sparkles className="h-2.5 w-2.5" /> Same Route
                                </Badge>
                              )}
                            </div>
                            <div className="font-semibold text-xs text-slate-900 mt-0.5">
                              {order.client.name}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {order.client.city}, {order.client.state}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-xs text-slate-950">
                              {formatWeightKg(order.totalKg)}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {order.distinctGsms.join(", ")} GSM
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 mt-2 border-t text-[11px]">
                          <div className="text-slate-500 font-mono">
                            Due:{" "}
                            {order.deliveryDate
                              ? new Date(order.deliveryDate).toLocaleDateString("en-IN")
                              : "Open"}
                            {daysUntil !== null && (
                              <span
                                className={`ml-1 font-semibold ${
                                  daysUntil < 0
                                    ? "text-red-600"
                                    : daysUntil <= 3
                                    ? "text-amber-600"
                                    : "text-slate-600"
                                }`}
                              >
                                ({daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d left`})
                              </span>
                            )}
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleAddOrder(order)}
                            className="h-7 px-3 text-xs gap-1 shadow-sm"
                          >
                            <Plus className="h-3 w-3" /> Add to Load
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANEL: This Load (6 Columns) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="rounded-[26px] border border-slate-100 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-5 border-b border-slate-800 bg-[#161622] text-white">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-white">
                  <Truck className="h-4 w-4 text-[#d4f842]" />
                  This Truck Load ({selectedOrders.length} Orders)
                </CardTitle>
                <div className="font-mono text-xs text-[#d4f842] font-bold">
                  {formatWeightKg(currentTotalKg)}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Truck Selector & Live Capacity Gauge */}
              <div className="p-3 bg-slate-50 rounded-lg border space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Select Truck *</label>
                    <TruckPicker
                      trucks={truckList}
                      transporters={transporters}
                      value={selectedTruckId}
                      onChange={setSelectedTruckId}
                      onCreated={(t) => setTruckList((prev) => [...prev, t])}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Transporter</label>
                    <Select
                      value={selectedTransporterId}
                      onValueChange={setSelectedTransporterId}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white">
                        <SelectValue placeholder="Select transporter" />
                      </SelectTrigger>
                      <SelectContent>
                        {transporters.map((tr) => (
                          <SelectItem key={tr.id} value={tr.id} className="text-xs">
                            {tr.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Live Capacity Gauge Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-600 font-sans font-medium">Truck Payload Gauge:</span>
                    <span className="font-bold">
                      {currentTotalKg.toLocaleString("en-IN")} / {truckCapacity.toLocaleString("en-IN")} kg (
                      <span
                        className={
                          isOverCapacity
                            ? "text-red-600"
                            : capacityPct >= 90
                            ? "text-emerald-700"
                            : capacityPct >= 70
                            ? "text-amber-700"
                            : "text-slate-600"
                        }
                      >
                        {capacityPct}%
                      </span>
                      )
                    </span>
                  </div>

                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden border">
                    <div
                      style={{ width: `${Math.min(100, capacityPct)}%` }}
                      className={`h-full transition-all duration-300 ${
                        isOverCapacity
                          ? "bg-red-600 animate-pulse"
                          : capacityPct >= 90
                          ? "bg-emerald-600"
                          : capacityPct >= 70
                          ? "bg-amber-500"
                          : "bg-blue-600"
                      }`}
                    />
                  </div>

                  {isOverCapacity && (
                    <div className="text-xs font-bold text-red-600 flex items-center gap-1 pt-0.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Payload exceeds truck limit by {formatWeightKg(overKg)}.
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Orders List */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
                  Assigned Orders in this Batch ({selectedOrders.length})
                </span>

                {selectedOrders.length === 0 ? (
                  <div className="p-6 text-center border border-dashed rounded-lg text-muted-foreground text-xs">
                    No orders added to this load yet. Click &quot;Add to Load&quot; on the left panel.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {selectedOrders.map((o, idx) => (
                      <div
                        key={o.id}
                        className="p-2.5 bg-slate-50 rounded-md border flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground w-4 text-center">
                            {idx + 1}.
                          </span>
                          <div>
                            <div className="font-mono font-bold text-primary">{o.orderNumber}</div>
                            <div className="text-[11px] text-slate-800 font-medium">
                              {o.client.name} ({o.client.city})
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-900">
                            {formatWeightKg(o.totalKg)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveOrder(o.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Driver & Schedule Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Driver Name</label>
                  <Input
                    placeholder="e.g. Ramesh Bhai"
                    className="h-8 text-xs"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Driver Phone</label>
                  <Input
                    placeholder="9825100000"
                    maxLength={10}
                    className="h-8 text-xs font-mono"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Planned Dispatch</label>
                  <Input
                    type="date"
                    className="h-8 text-xs font-mono"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Batch Dispatch Remarks</label>
                <Input
                  placeholder="e.g. Surat-Vapi single route delivery, gate pass required"
                  className="h-8 text-xs"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Advisory Warnings Callout */}
              {warnings.length > 0 && (
                <Alert className="border-amber-300 bg-amber-50 text-amber-900 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <AlertDescription className="text-xs space-y-0.5">
                    {warnings.map((w, idx) => (
                      <div key={idx}>• {w}</div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              {/* Footer Summary Statistics */}
              <div className="p-4 rounded-2xl bg-[#161622] text-white grid grid-cols-3 gap-2 text-center font-mono text-xs shadow-inner">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-semibold">CLIENTS</span>
                  <strong className="text-[#d4f842] text-sm">{distinctClients.length}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-semibold">CITIES</span>
                  <strong className="text-white text-sm">{distinctCities.length}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-semibold">TOTAL WEIGHT</span>
                  <strong className="text-[#d4f842] text-sm">{(currentTotalKg / 1000).toFixed(2)} MT</strong>
                </div>
              </div>

              {/* Submit Buttons */}
              <Button
                type="button"
                disabled={isSubmitting || selectedOrderIds.length === 0 || isOverCapacity}
                onClick={handleSaveBatch}
                className="w-full h-11 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-md transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#d4f842]" /> Saving Load Batch...
                  </>
                ) : (
                  "Create Truck Load Batch (Draft)"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * Searchable truck dropdown with an inline "Add New Truck" — everything a
 * dispatcher needs to pick or register a truck without leaving this form.
 * Adding a truck here calls the same `createTruck` action as Masters →
 * Trucks (same validation, same permission check), so it's just a shortcut,
 * not a separate path.
 */
function TruckPicker({
  trucks,
  transporters,
  value,
  onChange,
  onCreated,
}: {
  trucks: { id: string; registrationNumber: string; capacityKg: number; transporterId: string | null }[];
  transporters: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (truck: { id: string; registrationNumber: string; capacityKg: number; transporterId: string | null }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newReg, setNewReg] = React.useState("");
  const [newCapacity, setNewCapacity] = React.useState("20000");
  const [newTransporterId, setNewTransporterId] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const selected = trucks.find((t) => t.id === value);
  const filtered = trucks.filter((t) =>
    t.registrationNumber.toLowerCase().includes(query.trim().toLowerCase())
  );

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewReg("");
    setNewCapacity("20000");
    setNewTransporterId("");
  };

  const handleAddTruck = async () => {
    if (!newReg.trim()) {
      toast.error("Enter the truck's registration number.");
      return;
    }
    const capacity = Number(newCapacity);
    if (!capacity || capacity <= 0) {
      toast.error("Enter a valid truck capacity in kg.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await createTruck({
        registrationNumber: newReg.trim(),
        capacityKg: capacity,
        transporterId: newTransporterId || null,
        isActive: true,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (result.truck) {
        toast.success(`Truck "${result.truck.registrationNumber}" added.`);
        onCreated({
          id: result.truck.id,
          registrationNumber: result.truck.registrationNumber,
          capacityKg: result.truck.capacityKg,
          transporterId: result.truck.transporterId,
        });
        onChange(result.truck.id);
        resetAddForm();
        setQuery("");
        setOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add truck");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetAddForm();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 w-full text-xs bg-white border border-input rounded-md px-3 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
        >
          <span className={selected ? "font-mono font-bold text-primary truncate" : "text-muted-foreground"}>
            {selected
              ? `${selected.registrationNumber} (${(selected.capacityKg / 1000).toFixed(0)} MT capacity)`
              : "Select truck"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 border-b flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
          <Input
            autoFocus
            placeholder="Search registration number..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs border-0 shadow-none focus-visible:ring-0 px-1"
          />
        </div>

        <div className="max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No trucks match &quot;{query}&quot;.
            </div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between ${
                  t.id === value ? "bg-slate-50" : ""
                }`}
              >
                <span>
                  <span className="font-mono font-bold text-primary mr-1.5">{t.registrationNumber}</span>
                  ({(t.capacityKg / 1000).toFixed(0)} MT capacity)
                </span>
                {t.id === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>

        <div className="border-t p-2">
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true);
                setNewReg(query.trim());
              }}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-primary hover:bg-slate-50 rounded-md"
            >
              <Plus className="h-3.5 w-3.5" /> Add New Truck
            </button>
          ) : (
            <div className="space-y-2 p-1">
              <Input
                placeholder="Reg. no. e.g. GJ01AB1234"
                value={newReg}
                onChange={(e) => setNewReg(e.target.value.toUpperCase())}
                className="h-8 text-xs font-mono"
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Capacity (kg)"
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  className="h-8 text-xs flex-1"
                />
                {transporters.length > 0 && (
                  <select
                    value={newTransporterId}
                    onChange={(e) => setNewTransporterId(e.target.value)}
                    className="h-8 text-xs border border-input rounded-md px-2 bg-white flex-1"
                  >
                    <option value="">No transporter</option>
                    {transporters.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs flex-1"
                  disabled={isSaving}
                  onClick={handleAddTruck}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Truck"}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={resetAddForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
