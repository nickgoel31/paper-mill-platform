"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { OrderPriority, OrderStatus, PaperType, PaperSize, LengthUnit } from "@/generated/prisma/browser";
import { toInches, unitLabel } from "@/lib/units";
import {
  orderFormSchema,
  OrderFormInput,
} from "@/lib/schemas/order";
import { offlineCreateOrder, offlineUpdateOrder } from "@/lib/offline/wrapped-actions";
import { formatWeightKg, formatCurrencyINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { PAPER_TYPE_LABELS, PAPER_TYPES } from "@/lib/paper-type";
import { PAPER_SIZE_LABELS, PAPER_SIZES } from "@/lib/paper-size";

const NEW_ITEM_DEFAULTS = {
  widthInch: 45.0,
  widthUnit: LengthUnit.INCH,
  gsm: 120,
  paperType: PaperType.NATURAL,
  size: PaperSize.NORMAL,
  numberOfReels: null as number | null,
  remark: "",
  quantityKg: 3000,
  tolerancePercent: 5.0,
  ratePerKg: 34.0,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
}

export function OrderForm({
  initialOrder,
  clients,
  defaultUnit = LengthUnit.INCH,
  machineConstraints,
}: OrderFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const isEditing = !!initialOrder;

  const defaultItems = initialOrder?.items?.map((it: any) => ({
    id: it.id,
    // Show/edit the value in whatever unit it was originally entered in, not the
    // canonical inches — redisplaying "as entered" should never drift.
    widthInch: Number(it.enteredWidth ?? it.widthInch),
    widthUnit: (it.enteredWidthUnit as LengthUnit) || LengthUnit.INCH,
    gsm: Number(it.gsm),
    paperType: (it.paperType as PaperType) || PaperType.NATURAL,
    size: (it.size as PaperSize) || PaperSize.NORMAL,
    numberOfReels: it.numberOfReels ?? null,
    remark: it.remark || "",
    quantityKg: Number(it.quantityKg),
    tolerancePercent: Number(it.tolerancePercent || 5.0),
    ratePerKg: it.ratePerKg ? Number(it.ratePerKg) : null,
  })) || [{ ...NEW_ITEM_DEFAULTS, widthUnit: defaultUnit, quantityKg: 5000, ratePerKg: 35.0 }];

  const form = useForm<any>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      clientId: initialOrder?.clientId || (clients.length > 0 ? clients[0].id : ""),
      orderDate: initialOrder?.orderDate
        ? new Date(initialOrder.orderDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      deliveryDate: initialOrder?.deliveryDate
        ? new Date(initialOrder.deliveryDate).toISOString().split("T")[0]
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
      priority: initialOrder?.priority || OrderPriority.NORMAL,
      status: initialOrder?.status || OrderStatus.CONFIRMED,
      notes: initialOrder?.notes || "",
      otherNotes: initialOrder?.otherNotes || "",
      items: defaultItems,
    },
  });

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

  const { maxDeckle, minGsm, maxGsm, machines } = machineConstraints;

  // Real-time totals
  const totalWeightKg = React.useMemo(() => {
    return (watchedItems || []).reduce(
      (acc: number, item: any) => acc + (Number(item?.quantityKg) || 0),
      0
    );
  }, [watchedItems]);

  const totalValueINR = React.useMemo(() => {
    return (watchedItems || []).reduce((acc: number, item: any) => {
      const kg = Number(item?.quantityKg) || 0;
      const rate = Number(item?.ratePerKg) || 0;
      return acc + kg * rate;
    }, 0);
  }, [watchedItems]);

  const distinctGsms = React.useMemo(() => {
    const set = new Set<number>();
    (watchedItems || []).forEach((it: any) => {
      if (it?.gsm && !isNaN(it.gsm)) set.add(Number(it.gsm));
    });
    return Array.from(set);
  }, [watchedItems]);

  // Check for duplicate width + GSM pairs
  const duplicateWarnings = React.useMemo(() => {
    const counts = new Map<string, number>();
    const dupes: string[] = [];
    (watchedItems || []).forEach((it: any) => {
      if (!it || !it.widthInch || !it.gsm) return;
      const type = PAPER_TYPE_LABELS[it.paperType as PaperType] || it.paperType;
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
        if (it.remark && !existing.remark) existing.remark = it.remark;
      }
    });
    replace(Array.from(mergedMap.values()));
    toast.success("Duplicate line items merged successfully.");
  };

  const onSubmit = async (values: OrderFormInput) => {
    setIsSubmitting(true);
    try {
      if (isEditing) {
        const result = await offlineUpdateOrder(initialOrder.id, values);
        if (result.queued) {
          toast.info(
            `Offline — changes to Order #${initialOrder.orderNumber} saved locally and will sync automatically.`
          );
          router.push(`/orders/${initialOrder.id}`);
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
        } else {
          toast.success(`Sales Order #${result.data!.orderNumber} created successfully!`);
          router.push(`/orders/${result.data!.id}`);
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

              {/* Promised Delivery Date */}
              <FormField
                control={form.control}
                name="deliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold text-slate-700">Promised Delivery Date *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
                      />
                    </FormControl>
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

            {/* Line Items Table */}
            <div className="rounded-xl border border-slate-100 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/70">
                  <TableRow>
                    <TableHead className="w-12 text-center text-[10px] font-bold font-mono">#</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500 min-w-[130px]">Width *</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">GSM *</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500 min-w-[150px]">Paper Type *</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500 min-w-[110px]">Size</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Qty (Reels)</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Weight (KG) *</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Tolerance (%)</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500">Rate / KG (₹)</TableHead>
                    <TableHead className="text-[11px] font-bold uppercase text-slate-500 min-w-[160px]">Remark</TableHead>
                    <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Line Total (₹)</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, idx) => {
                    const currentItem = watchedItems?.[idx];
                    const currentWidth = Number(currentItem?.widthInch) || 0;
                    const currentWidthUnit = (currentItem?.widthUnit as LengthUnit) || LengthUnit.INCH;
                    const currentWidthInches = toInches(currentWidth, currentWidthUnit);
                    const currentGsm = Number(currentItem?.gsm) || 0;
                    const currentKg = Number(currentItem?.quantityKg) || 0;
                    const currentRate = Number(currentItem?.ratePerKg) || 0;
                    const lineAmount = currentKg * currentRate;

                    const isExceedingDeckle = currentWidthInches > maxDeckle;

                    return (
                      <TableRow key={field.id} className="hover:bg-slate-50/50">
                        <TableCell className="text-center font-mono text-xs text-slate-400 font-bold">
                          {idx + 1}
                        </TableCell>

                        {/* Width + unit */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <FormField
                              control={form.control}
                              name={`items.${idx}.widthInch`}
                              render={({ field: itField }) => (
                                <FormItem className="flex-1">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      {...itField}
                                      className={`h-9 text-xs rounded-xl font-mono ${
                                        isExceedingDeckle ? "border-rose-500 bg-rose-50" : "bg-slate-50/70 border-slate-200"
                                      }`}
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
                                <Select onValueChange={itField.onChange} value={itField.value}>
                                  <SelectTrigger className="h-9 w-[70px] text-[11px] rounded-xl bg-slate-50/70 border-slate-200 shrink-0">
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
                        </TableCell>

                        {/* GSM */}
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.gsm`}
                            render={({ field: itField }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      {...itField}
                                      className="h-9 text-xs rounded-xl font-mono bg-slate-50/70 border-slate-200"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                      GSM
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>

                        {/* Paper Type */}
                        <TableCell>
                          <div className="space-y-1.5">
                            <FormField
                              control={form.control}
                              name={`items.${idx}.paperType`}
                              render={({ field: itField }) => (
                                <FormItem>
                                  <Select
                                    onValueChange={itField.onChange}
                                    value={itField.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="h-9 text-xs rounded-xl bg-slate-50/70 border-slate-200">
                                        <SelectValue placeholder="Type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="rounded-xl">
                                      {PAPER_TYPES.map((pt) => (
                                        <SelectItem key={pt} value={pt} className="text-xs">
                                          {PAPER_TYPE_LABELS[pt]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </TableCell>

                        {/* Size */}
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.size`}
                            render={({ field: itField }) => (
                              <FormItem>
                                <Select
                                  onValueChange={itField.onChange}
                                  value={itField.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-9 text-xs rounded-xl bg-slate-50/70 border-slate-200">
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
                        </TableCell>

                        {/* Qty (Reels) */}
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.numberOfReels`}
                            render={({ field: itField }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      step="1"
                                      min="0"
                                      placeholder="—"
                                      value={itField.value ?? ""}
                                      onChange={(e) =>
                                        itField.onChange(
                                          e.target.value ? Math.floor(Number(e.target.value)) : null
                                        )
                                      }
                                      className="h-9 text-xs rounded-xl font-mono bg-slate-50/70 border-slate-200 w-24"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                      reels
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>

                        {/* Quantity (KG) */}
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.quantityKg`}
                            render={({ field: itField }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      step="1"
                                      {...itField}
                                      className="h-9 text-xs rounded-xl font-mono font-bold text-slate-900 bg-slate-50/70 border-slate-200"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                      kg
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>

                        {/* Tolerance */}
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.tolerancePercent`}
                            render={({ field: itField }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      step="0.1"
                                      {...itField}
                                      className="h-9 text-xs rounded-xl font-mono bg-slate-50/70 border-slate-200"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                      %
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>

                        {/* Rate / KG */}
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.ratePerKg`}
                            render={({ field: itField }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={itField.value ?? ""}
                                      onChange={(e) =>
                                        itField.onChange(
                                          e.target.value ? Number(e.target.value) : null
                                        )
                                      }
                                      className="h-9 text-xs rounded-xl font-mono bg-slate-50/70 border-slate-200"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                                      ₹/kg
                                    </span>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>

                        {/* Remark */}
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`items.${idx}.remark`}
                            render={({ field: itField }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. jointless, tight winding"
                                    value={itField.value ?? ""}
                                    onChange={(e) => itField.onChange(e.target.value)}
                                    className="h-9 text-xs rounded-xl bg-slate-50/70 border-slate-200"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>

                        {/* Line Total */}
                        <TableCell className="text-right font-mono font-bold text-xs text-slate-900">
                          {formatCurrencyINR(lineAmount)}
                        </TableCell>

                        {/* Remove */}
                        <TableCell className="text-center">
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
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
