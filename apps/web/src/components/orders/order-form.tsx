"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { OrderPriority, OrderStatus, PaperSize, LengthUnit } from "@/generated/prisma/browser";
import { toInches, unitLabel } from "@/lib/units";
import {
  orderFormSchema,
  OrderFormInput,
} from "@/lib/schemas/order";
import { offlineCreateOrder, offlineUpdateOrder } from "@/lib/offline/wrapped-actions";
import { formatWeightKg, formatCurrencyINR, formatOrderAge } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import { PAPER_TYPE_LABELS } from "@/lib/paper-type";
import { PAPER_SIZE_LABELS, PAPER_SIZES } from "@/lib/paper-size";

const NEW_ITEM_DEFAULTS = {
  isBookingOnly: false,
  widthInch: 45.0,
  widthUnit: LengthUnit.INCH,
  gsm: 120,
  paperType: "NATURAL",
  size: PaperSize.NORMAL,
  bf: 18,
  numberOfReels: null as number | null,
  remark: "",
  quantityKg: 3000,
  tolerancePercent: 0,
  ratePerKg: null as number | null,
  amount: null as number | null,
  kgPerInchOverride: null as number | null,
};
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Info,
  Layers,
  ArrowLeft,
  Loader2,
  Combine,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Building,
  Calendar,
  CheckCircle2,
} from "lucide-react";

interface ClientOption {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
}

interface MachineConstraint {
  id: string;
  name: string;
  code: string;
  maxDeckleInch: number;
  minDeckleInch: number;
  minGsm: number;
  maxGsm: number;
}

interface OrderFormProps {
  initialOrder?: any;
  clients: ClientOption[];
  /** Mill's default width unit (Settings). New reel rows start in this unit. */
  defaultUnit?: LengthUnit;
  machineConstraints: {
    machines: MachineConstraint[];
    maxDeckle: number;
    minGsm: number;
    maxGsm: number;
  };
  /** `{ gsm: kgPerInch }` from the GSM Weight Chart — used to auto-fill weight from width × reels in real time. */
  gsmWeightMap?: Record<number, number>;
  /** Paper Types master list (Masters → Paper Types). */
  paperTypeOptions?: { value: string; label: string }[];
}

export function OrderForm({
  initialOrder,
  clients,
  defaultUnit = LengthUnit.INCH,
  machineConstraints,
  gsmWeightMap = {},
  paperTypeOptions = [],
}: OrderFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isEditing = !!initialOrder;
  // Row indexes whose weight the user has typed directly — auto-fill stops
  // touching that row's weight once they do, until width/GSM/reels changes again.
  const manualWeightRows = React.useRef<Set<number>>(new Set());
  // Row indexes whose reel count the user has typed directly — protects it
  // from being overwritten by the weight -> reels auto-calc below.
  const manualReelsRows = React.useRef<Set<number>>(new Set());

  const defaultItems = initialOrder?.items?.map((it: any) => ({
    id: it.id,
    isBookingOnly: it.isBookingOnly ?? false,
    // Show/edit the value in whatever unit it was originally entered in, not the
    // canonical inches — redisplaying "as entered" should never drift.
    widthInch: Number(it.enteredWidth ?? it.widthInch),
    widthUnit: (it.enteredWidthUnit as LengthUnit) || LengthUnit.INCH,
    gsm: Number(it.gsm),
    paperType: it.paperType || "NATURAL",
    size: (it.size as PaperSize) || PaperSize.NORMAL,
    bf: it.bf ?? 18,
    numberOfReels: it.numberOfReels ?? null,
    remark: it.remark || "",
    quantityKg: Number(it.quantityKg),
    tolerancePercent: Number(it.tolerancePercent || 5.0),
    ratePerKg: it.ratePerKg ? Number(it.ratePerKg) : null,
    kgPerInchOverride: it.kgPerInchOverride ? Number(it.kgPerInchOverride) : null,
    // Restate the line's original commercial amount for editing; it was
    // originally typed in directly, not derived, so re-derive it here just
    // for display continuity.
    amount: it.ratePerKg ? Number(it.ratePerKg) * Number(it.quantityKg) : null,
  })) || [{ ...NEW_ITEM_DEFAULTS, widthUnit: defaultUnit, quantityKg: 5000 }];

  const form = useForm<any>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      clientId: initialOrder?.clientId || (clients.length > 0 ? clients[0].id : ""),
      offlineOrderNo: initialOrder?.offlineOrderNo || "",
      orderDate: initialOrder?.orderDate
        ? new Date(initialOrder.orderDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      // Optional — leave blank rather than forcing a guessed date. Wherever
      // it's displayed, a blank delivery date falls back to "Created Xd ago".
      deliveryDate: initialOrder?.deliveryDate
        ? new Date(initialOrder.deliveryDate).toISOString().split("T")[0]
        : "",
      priority: initialOrder?.priority || OrderPriority.NORMAL,
      status: initialOrder?.status || OrderStatus.CONFIRMED,
      notes: initialOrder?.notes || "",
      otherNotes: initialOrder?.otherNotes || "",
      items: defaultItems,
    },
  });

  // Recompute a row's weight from width × reels × kg/inch — this party's own
  // override if this line has one, otherwise the GSM chart's default — unless
  // the user has typed a weight for this row directly.
  const recalcWeight = (idx: number) => {
    if (manualWeightRows.current.has(idx)) return;
    const item = form.getValues(`items.${idx}`);
    const gsm = Number(item?.gsm);
    const override = Number(item?.kgPerInchOverride);
    const kgPerInch = override > 0 ? override : gsmWeightMap[gsm];
    const width = Number(item?.widthInch);
    if (!kgPerInch || !width || width <= 0) return;
    const widthInches = toInches(width, item?.widthUnit || LengthUnit.INCH);
    const reels = Number(item?.numberOfReels) > 0 ? Number(item.numberOfReels) : 1;
    const weight = Number((kgPerInch * widthInches * reels).toFixed(2));
    form.setValue(`items.${idx}.quantityKg`, weight, { shouldDirty: true });
  };

  // Reverse direction: when the mill types GSM + Width + a total Weight
  // (e.g. "120 GSM, 24 inch, 20 MT") instead of a reel count, back out the
  // rounded reel count from the GSM Weight Chart automatically. Only runs
  // once the weight has been typed by hand and the reel count hasn't been —
  // whichever of the two the user actually typed stays the source of truth.
  const recalcReelsFromWeight = (idx: number) => {
    if (manualReelsRows.current.has(idx)) return;
    if (!manualWeightRows.current.has(idx)) return;
    const item = form.getValues(`items.${idx}`);
    const gsm = Number(item?.gsm);
    const override = Number(item?.kgPerInchOverride);
    const kgPerInch = override > 0 ? override : gsmWeightMap[gsm];
    const width = Number(item?.widthInch);
    const weight = Number(item?.quantityKg);
    if (!kgPerInch || !width || width <= 0 || !weight || weight <= 0) return;
    const widthInches = toInches(width, item?.widthUnit || LengthUnit.INCH);
    const weightPerReel = kgPerInch * widthInches;
    if (!weightPerReel || weightPerReel <= 0) return;
    const reels = Math.round(weight / weightPerReel);
    form.setValue(`items.${idx}.numberOfReels`, reels > 0 ? reels : null, { shouldDirty: true });
  };

  // Whichever of weight/reels the user typed by hand drives the other —
  // width/GSM/override changes resync in that same direction.
  const syncItemCalc = (idx: number) => {
    if (manualWeightRows.current.has(idx) && !manualReelsRows.current.has(idx)) {
      recalcReelsFromWeight(idx);
    } else {
      recalcWeight(idx);
    }
  };

  // How many identical rows the "Add Reel Size" button inserts at once.
  const [addQty, setAddQty] = React.useState(1);

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({
    control: form.control,
    name: "items",
  });

  const watchedOrderDate = useWatch({
    control: form.control,
    name: "orderDate",
  });

  const { maxDeckle, minGsm, maxGsm, machines } = machineConstraints;

  // Real-time totals
  const totalWeightKg = React.useMemo(() => {
    return (watchedItems || []).reduce(
      (acc: number, item: any) => acc + (Number(item?.quantityKg) || 0),
      0
    );
  }, [watchedItems]);

  // Sum of the amounts the user typed in directly — never derived from
  // quantity × rate.
  const totalValueINR = React.useMemo(() => {
    return (watchedItems || []).reduce(
      (acc: number, item: any) => acc + (Number(item?.amount) || 0),
      0
    );
  }, [watchedItems]);

  const distinctGsms = React.useMemo(() => {
    const set = new Set<number>();
    (watchedItems || []).forEach((it: any) => {
      if (!it?.isBookingOnly && it?.gsm && !isNaN(it.gsm)) set.add(Number(it.gsm));
    });
    return Array.from(set);
  }, [watchedItems]);

  // Check for duplicate width + GSM pairs
  const duplicateWarnings = React.useMemo(() => {
    const counts = new Map<string, number>();
    const dupes: string[] = [];
    (watchedItems || []).forEach((it: any) => {
      if (!it || it.isBookingOnly || !it.widthInch || !it.gsm) return;
      const type =
        paperTypeOptions.find((pt) => pt.value === it.paperType)?.label ||
        PAPER_TYPE_LABELS[it.paperType] ||
        it.paperType;
      const widthIn = toInches(Number(it.widthInch), it.widthUnit || LengthUnit.INCH);
      const key = `${widthIn.toFixed(2)}" @ ${it.gsm} GSM • ${type}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    counts.forEach((count, key) => {
      if (count > 1) dupes.push(key);
    });
    return dupes;
  }, [watchedItems]);

  // Merge duplicates handler
  const handleMergeDuplicates = () => {
    const mergedMap = new Map<string, any>();
    (watchedItems || []).forEach((it: any) => {
      if (!it) return;
      const widthIn = toInches(Number(it.widthInch), it.widthUnit || LengthUnit.INCH);
      const key = `${widthIn.toFixed(2)}@${Number(it.gsm)}@${it.paperType}`;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, { ...it });
      } else {
        const existing = mergedMap.get(key);
        existing.quantityKg = (Number(existing.quantityKg) || 0) + (Number(it.quantityKg) || 0);
        const reels = (Number(existing.numberOfReels) || 0) + (Number(it.numberOfReels) || 0);
        existing.numberOfReels = reels > 0 ? reels : null;
        existing.amount = (Number(existing.amount) || 0) + (Number(it.amount) || 0) || null;
        if (it.remark && !existing.remark) existing.remark = it.remark;
      }
    });
    replace(Array.from(mergedMap.values()));
    toast.success("Duplicate line items merged successfully.");
  };

  const onSubmit = async (formValues: OrderFormInput) => {
    setIsSubmitting(true);
    try {
      // The mill types the commercial amount directly; back it out into
      // ratePerKg only for storage/invoicing, never the other way around.
      const values: OrderFormInput = {
        ...formValues,
        items: (formValues.items as any[]).map((it) => ({
          ...it,
          ratePerKg:
            it.amount != null && it.quantityKg > 0
              ? Number((Number(it.amount) / Number(it.quantityKg)).toFixed(4))
              : it.ratePerKg ?? null,
        })),
      } as OrderFormInput;

      if (isEditing) {
        const result = await offlineUpdateOrder(initialOrder.id, values);
        if (result.queued) {
          toast.info(
            `Offline — changes to Order #${initialOrder.orderNumber} saved locally and will sync automatically.`
          );
          router.push(`/orders/${initialOrder.id}`);
        } else if (result.data && "error" in result.data && result.data.error) {
          toast.error(result.data.error);
          return;
        } else {
          toast.success(`Order #${initialOrder.orderNumber} updated successfully.`);
          router.push(`/orders/${initialOrder.id}`);
        }
      } else {
        const result = await offlineCreateOrder(values);
        if (result.queued) {
          // No server id exists yet for a queued create, so the detail page
          // (a fresh server render) can't be opened until this syncs.
          toast.info("Offline — sales order saved locally and will be created once you're back online.");
          router.push("/orders");
        } else if (result.data && "error" in result.data && result.data.error) {
          toast.error(result.data.error);
          return;
        } else {
          const created = (result.data as any).order;
          toast.success(`Sales Order #${created.orderNumber} created successfully!`);
          router.push(`/orders/${created.id}`);
        }
      }
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save sales order");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-10">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold uppercase tracking-wide">
            {isEditing ? "EDIT ORDER DETAILS" : "STEP 1 • NEW ORDER BOOKING"}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShoppingCart className="h-7 w-7 text-sky-500" />
            {isEditing ? `Edit Order #${initialOrder.orderNumber}` : "Create Sales Order"}
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Define customer reel sizes, GSM qualities, order weights, commercial rates, and tolerances for the deckle optimizer.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" className="h-10 px-4 rounded-xl bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-bold text-xs shadow-xs">
            <Link href={isEditing ? `/orders/${initialOrder.id}` : "/orders"}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Orders
            </Link>
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* 2. ORDER HEADER CARD */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building className="h-4 w-4 text-sky-500" /> Client & Order Header Information
              </h2>
              <span className="text-[11px] text-slate-400 font-mono">
                Jurisdiction & Tax Profile
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Client Selection */}
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem className="md:col-span-1">
                    <FormLabel className="text-xs font-bold text-slate-700">Client / Corrugator *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200">
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl max-h-64">
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            <span className="font-mono font-bold text-sky-600 mr-1.5">
                              {c.code}
                            </span>
                            {c.name} ({c.city})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Offline / client's own booking reference */}
              <FormField
                control={form.control}
                name="offlineOrderNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Offline Order No.</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. diary booking / phone order ref"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200 font-mono"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Order Date */}
              <FormField
                control={form.control}
                name="orderDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Order Booking Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Promised Delivery Date (optional) */}
              <FormField
                control={form.control}
                name="deliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Promised Delivery Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
                      />
                    </FormControl>
                    {!field.value && (
                      <p className="text-[10px] text-slate-400">
                        Not set — will display as &quot;{formatOrderAge(watchedOrderDate)}&quot; until a date is given.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
              {/* Order Priority */}
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Order Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200">
                          <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value={OrderPriority.NORMAL} className="text-xs">
                          NORMAL (Standard Queue)
                        </SelectItem>
                        <SelectItem value={OrderPriority.URGENT} className="text-xs text-rose-600 font-bold">
                          URGENT (Solver Priority)
                        </SelectItem>
                        <SelectItem value={OrderPriority.STOCK} className="text-xs text-slate-500 font-mono">
                          STOCK (Inventory Buffer)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Initial Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Workflow Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        <SelectItem value={OrderStatus.CONFIRMED} className="text-xs text-blue-700 font-bold">
                          CONFIRMED (Ready for Deckle Planning)
                        </SelectItem>
                        <SelectItem value={OrderStatus.DRAFT} className="text-xs text-slate-600">
                          DRAFT (Holding)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Operational Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Consignee & Special Instructions</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Consignee destination, jointless paper, etc."
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Other / extra notes */}
            <FormField
              control={form.control}
              name="otherNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold text-slate-700">Other Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any other notes for this order (packing, marking, payment terms, etc.)"
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      rows={2}
                      className="text-xs rounded-xl bg-slate-50/70 border-slate-200 resize-y"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* 3. REEL DEMAND LINE ITEMS */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-500" /> Reel Demand Line Items ({fields.length} Sizes)
                </h2>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Width in inches, paper GSM quality, demanded kilograms, and ±5% tolerance.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {duplicateWarnings.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMergeDuplicates}
                    className="h-8 text-xs font-bold text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl gap-1.5"
                  >
                    <Combine className="h-3.5 w-3.5" /> Merge Duplicate Sizes ({duplicateWarnings.length})
                  </Button>
                )}

                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Rows</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={addQty}
                    onChange={(e) =>
                      setAddQty(Math.min(50, Math.max(1, Math.floor(Number(e.target.value) || 1))))
                    }
                    className="h-8 w-14 text-xs rounded-xl font-mono text-center bg-slate-50/70 border-slate-200"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const row = { ...NEW_ITEM_DEFAULTS, widthUnit: defaultUnit, gsm: distinctGsms[0] || 120 };
                      append(Array.from({ length: addQty }, () => ({ ...row })));
                    }}
                    className="h-8 text-xs font-bold bg-[#161622] hover:bg-[#202030] text-white rounded-xl shadow-xs gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                    {addQty > 1 ? `Add ${addQty} Reel Sizes` : "Add Reel Size"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Line Items — one spacious card per reel size, not a cramped table */}
            <div className="space-y-4">
              {fields.map((field, idx) => {
                const currentItem = watchedItems?.[idx];
                const currentWidth = Number(currentItem?.widthInch) || 0;
                const currentWidthUnit = (currentItem?.widthUnit as LengthUnit) || LengthUnit.INCH;
                const currentWidthInches = toInches(currentWidth, currentWidthUnit);
                const isBookingOnly = !!currentItem?.isBookingOnly;
                const isExceedingDeckle = !isBookingOnly && currentWidthInches > maxDeckle;

                return (
                  <div
                    key={field.id}
                    className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
                      isBookingOnly ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/40"
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-mono">
                          {isBookingOnly ? `Booking #${idx + 1}` : `Reel Size #${idx + 1}`}
                        </span>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.isBookingOnly`}
                          render={({ field: itField }) => (
                            <label className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 cursor-pointer select-none">
                              <Checkbox
                                checked={itField.value}
                                onCheckedChange={(v) => itField.onChange(!!v)}
                              />
                              Booking only (no size/reel yet)
                            </label>
                          )}
                        />
                      </div>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(idx)}
                          className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {isBookingOnly && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 -mt-1">
                        No size/reel needed yet — this line won&apos;t appear in deckle planning or stock matching until it&apos;s edited with real dimensions.
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Width + unit */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">
                          Width {!isBookingOnly && "*"}
                        </FormLabel>
                        <div className="flex items-center gap-1.5 mt-1">
                          <FormField
                            control={form.control}
                            name={`items.${idx}.widthInch`}
                            render={({ field: itField }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    disabled={isBookingOnly}
                                    {...itField}
                                    onChange={(e) => {
                                      itField.onChange(e);
                                      syncItemCalc(idx);
                                    }}
                                    className={`h-10 text-sm rounded-xl font-mono ${
                                      isExceedingDeckle ? "border-rose-500 bg-rose-50" : "bg-white border-slate-200"
                                    } disabled:opacity-50 disabled:bg-slate-100`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`items.${idx}.widthUnit`}
                            render={({ field: itField }) => (
                              <Select
                                onValueChange={(val) => {
                                  itField.onChange(val);
                                  syncItemCalc(idx);
                                }}
                                value={itField.value}
                              >
                                <SelectTrigger className="h-10 w-[72px] text-xs rounded-xl bg-white border-slate-200 shrink-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  <SelectItem value={LengthUnit.INCH} className="text-xs">in</SelectItem>
                                  <SelectItem value={LengthUnit.CM} className="text-xs">cm</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        {isExceedingDeckle && (
                          <p className="text-[10px] text-rose-500 mt-1">
                            = {currentWidthInches.toFixed(2)}" — exceeds {maxDeckle.toFixed(2)}" max deckle
                          </p>
                        )}
                      </div>

                      {/* GSM */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">
                          GSM {!isBookingOnly && "*"}
                        </FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.gsm`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    disabled={isBookingOnly}
                                    {...itField}
                                    onChange={(e) => {
                                      itField.onChange(e);
                                      syncItemCalc(idx);
                                    }}
                                    className="h-10 text-sm rounded-xl font-mono bg-white border-slate-200 disabled:opacity-50 disabled:bg-slate-100"
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                    GSM
                                  </span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Paper Type */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">Paper Type *</FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.paperType`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <Select onValueChange={itField.onChange} value={itField.value}>
                                <FormControl>
                                  <SelectTrigger className="h-10 text-sm rounded-xl bg-white border-slate-200">
                                    <SelectValue placeholder="Type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="rounded-xl">
                                  {itField.value && !paperTypeOptions.some((pt) => pt.value === itField.value) && (
                                    <SelectItem value={itField.value} className="text-xs">
                                      {itField.value} (current)
                                    </SelectItem>
                                  )}
                                  {paperTypeOptions.map((pt) => (
                                    <SelectItem key={pt.value} value={pt.value} className="text-xs">
                                      {pt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Size */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">Size</FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.size`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <Select onValueChange={itField.onChange} value={itField.value}>
                                <FormControl>
                                  <SelectTrigger className="h-10 text-sm rounded-xl bg-white border-slate-200">
                                    <SelectValue placeholder="Size" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="rounded-xl">
                                  {PAPER_SIZES.map((sz) => (
                                    <SelectItem key={sz} value={sz} className="text-xs">
                                      {PAPER_SIZE_LABELS[sz]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Qty (Reels) */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">Qty (Reels)</FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.numberOfReels`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="1"
                                    min="0"
                                    placeholder="—"
                                    value={itField.value ?? ""}
                                    onChange={(e) => {
                                      manualReelsRows.current.add(idx);
                                      itField.onChange(
                                        e.target.value ? Math.floor(Number(e.target.value)) : null
                                      );
                                      recalcWeight(idx);
                                    }}
                                    className="h-10 text-sm rounded-xl font-mono bg-white border-slate-200"
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                    reels
                                  </span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Quantity (KG) */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
                          Weight (KG) *
                          {!manualWeightRows.current.has(idx) && Number(currentItem?.kgPerInchOverride) > 0 && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md normal-case">
                              auto (party override)
                            </span>
                          )}
                          {!manualWeightRows.current.has(idx) &&
                            !(Number(currentItem?.kgPerInchOverride) > 0) &&
                            gsmWeightMap[Number(currentItem?.gsm)] && (
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md normal-case">
                                auto (GSM chart)
                              </span>
                            )}
                        </FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.quantityKg`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="1"
                                    {...itField}
                                    onChange={(e) => {
                                      manualWeightRows.current.add(idx);
                                      itField.onChange(e);
                                      recalcReelsFromWeight(idx);
                                    }}
                                    className="h-10 text-sm rounded-xl font-mono font-bold text-slate-900 bg-white border-slate-200"
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                    kg
                                  </span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Tolerance */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">Tolerance (%)</FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.tolerancePercent`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    {...itField}
                                    className="h-10 text-sm rounded-xl font-mono bg-white border-slate-200"
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                    %
                                  </span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Amount — manually entered, never auto-calculated */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">Amount (₹) *</FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.amount`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Enter total amount"
                                    value={itField.value ?? ""}
                                    onChange={(e) =>
                                      itField.onChange(e.target.value ? Number(e.target.value) : null)
                                    }
                                    className="h-10 text-sm rounded-xl font-mono font-bold text-emerald-700 bg-white border-slate-200"
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                    ₹
                                  </span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Remark */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">Remark</FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.remark`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <Input
                                  placeholder="e.g. jointless, tight winding"
                                  value={itField.value ?? ""}
                                  onChange={(e) => itField.onChange(e.target.value)}
                                  className="h-10 text-sm rounded-xl bg-white border-slate-200"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* This party's own kg/inch, overriding the mill's GSM Weight Chart just for this line */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1.5">
                          Override kg/inch
                          <span className="text-[9px] font-semibold text-slate-400 normal-case">
                            (this party only — optional)
                          </span>
                        </FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.kgPerInchOverride`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder={
                                      gsmWeightMap[Number(currentItem?.gsm)]
                                        ? `Mill default: ${gsmWeightMap[Number(currentItem?.gsm)]}`
                                        : "e.g. 15.75"
                                    }
                                    value={itField.value ?? ""}
                                    onChange={(e) => {
                                      itField.onChange(e.target.value ? Number(e.target.value) : null);
                                      syncItemCalc(idx);
                                    }}
                                    className="h-10 text-sm rounded-xl font-mono bg-white border-slate-200"
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                    kg/in
                                  </span>
                                </div>
                              </FormControl>
                              <p className="text-[10px] text-slate-400 mt-1">
                                Leave blank to use the mill&apos;s GSM Weight Chart for {currentItem?.gsm || "this"} GSM.
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Burst Factor — informational only, has no effect on the deckle solver */}
                      <div>
                        <FormLabel className="text-[11px] font-bold uppercase text-slate-500">BF</FormLabel>
                        <FormField
                          control={form.control}
                          name={`items.${idx}.bf`}
                          render={({ field: itField }) => (
                            <FormItem className="mt-1">
                              <FormControl>
                                <Input
                                  type="number"
                                  step="1"
                                  min="1"
                                  placeholder="18"
                                  value={itField.value ?? ""}
                                  onChange={(e) =>
                                    itField.onChange(e.target.value ? Number(e.target.value) : "")
                                  }
                                  className="h-10 text-sm rounded-xl font-mono bg-white border-slate-200"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. COMMERCIAL SUMMARY & SUBMIT BOTTOM CARD */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">TOTAL DEMAND WEIGHT</span>
                <span className="text-2xl font-black font-mono text-slate-900">
                  {formatWeightKg(totalWeightKg)}{" "}
                  <span className="text-xs font-semibold text-slate-400 font-sans">
                    ({(totalWeightKg / 1000).toFixed(2)} MT)
                  </span>
                </span>
              </div>

              <div className="h-8 w-px bg-slate-100 hidden sm:block" />

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">GROSS TAXABLE VALUE</span>
                <span className="text-2xl font-black font-mono text-emerald-700">
                  {formatCurrencyINR(totalValueINR)}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-100 hidden sm:block" />

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">DISTINCT QUALITIES</span>
                <div className="flex items-center gap-1 mt-1">
                  {distinctGsms.map((gsm) => (
                    <span
                      key={gsm}
                      className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-mono font-bold text-[10px]"
                    >
                      {gsm} GSM
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button
                asChild
                variant="outline"
                className="h-11 px-5 rounded-xl border-slate-200 text-slate-700 font-bold text-xs"
              >
                <Link href={isEditing ? `/orders/${initialOrder.id}` : "/orders"}>
                  Cancel
                </Link>
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 px-7 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs shadow-sm transition-all w-full md:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving Order...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {isEditing ? "Update Sales Order" : "Submit & Confirm Sales Order"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
