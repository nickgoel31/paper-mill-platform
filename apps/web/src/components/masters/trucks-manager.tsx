"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { CrudSheet } from "@/components/data-table/crud-sheet";
import { ConfirmDialog } from "@/components/data-table/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  transporterSchema,
  truckSchema,
  TransporterFormInput,
  TruckFormInput,
} from "@/lib/schemas/truck";
import {
  getTransporters,
  createTransporter,
  updateTransporter,
  deleteTransporter,
  getTrucks,
  createTruck,
  updateTruck,
  deleteTruck,
} from "@/server/services/truck-service";
import { formatWeightKg } from "@/lib/utils";
import {
  Truck as TruckIcon,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Building,
  Phone,
} from "lucide-react";

interface TransporterRow {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  isActive: boolean;
  _count?: { trucks: number; loadBatches: number };
}

interface TruckRow {
  id: string;
  registrationNumber: string;
  capacityKg: number;
  transporterId: string | null;
  owner?: { id: string; name: string } | null;
  isActive: boolean;
}

interface TrucksManagerProps {
  initialTransporters: {
    rows: TransporterRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  initialTrucks: {
    rows: TruckRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  transportersList: { id: string; name: string }[];
  isAdmin: boolean;
}

export function TrucksManager({
  initialTransporters,
  initialTrucks,
  transportersList,
  isAdmin,
}: TrucksManagerProps) {
  const [activeTab, setActiveTab] = React.useState<"trucks" | "transporters">("trucks");

  // Transporters State
  const [transportersData, setTransportersData] = React.useState(initialTransporters.rows);
  const [transportersTotal, setTransportersTotal] = React.useState(initialTransporters.total);
  const [transportersPage, setTransportersPage] = React.useState(initialTransporters.page);
  const [transportersSearch, setTransportersSearch] = React.useState("");
  const [transportersLoading, setTransportersLoading] = React.useState(false);

  // Trucks State
  const [trucksData, setTrucksData] = React.useState(initialTrucks.rows);
  const [trucksTotal, setTrucksTotal] = React.useState(initialTrucks.total);
  const [trucksPage, setTrucksPage] = React.useState(initialTrucks.page);
  const [trucksSearch, setTrucksSearch] = React.useState("");
  const [trucksLoading, setTrucksLoading] = React.useState(false);

  // Transporter Dialogs
  const [transporterSheetOpen, setTransporterSheetOpen] = React.useState(false);
  const [editingTransporter, setEditingTransporter] = React.useState<TransporterRow | null>(null);
  const [transporterDeleteOpen, setTransporterDeleteOpen] = React.useState(false);
  const [deletingTransporter, setDeletingTransporter] = React.useState<TransporterRow | null>(null);
  const [transporterDeleteError, setTransporterDeleteError] = React.useState<string | null>(null);

  // Truck Dialogs
  const [truckSheetOpen, setTruckSheetOpen] = React.useState(false);
  const [editingTruck, setEditingTruck] = React.useState<TruckRow | null>(null);
  const [truckDeleteOpen, setTruckDeleteOpen] = React.useState(false);
  const [deletingTruck, setDeletingTruck] = React.useState<TruckRow | null>(null);
  const [truckDeleteError, setTruckDeleteError] = React.useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Forms
  const transporterForm = useForm<TransporterFormInput>({
    resolver: zodResolver(transporterSchema),
    defaultValues: { name: "", phone: "", gstin: "", isActive: true },
  });

  const truckForm = useForm<TruckFormInput>({
    resolver: zodResolver(truckSchema),
    defaultValues: { registrationNumber: "", capacityKg: 20000, transporterId: "", isActive: true },
  });

  // Fetch Transporters
  const fetchTransporters = React.useCallback(async (newPage: number, search: string) => {
    setTransportersLoading(true);
    try {
      const res = await getTransporters({ page: newPage, search });
      setTransportersData(res.rows as any);
      setTransportersTotal(res.total);
      setTransportersPage(res.page);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch transporters");
    } finally {
      setTransportersLoading(false);
    }
  }, []);

  // Fetch Trucks
  const fetchTrucks = React.useCallback(async (newPage: number, search: string) => {
    setTrucksLoading(true);
    try {
      const res = await getTrucks({ page: newPage, search });
      setTrucksData(res.rows as any);
      setTrucksTotal(res.total);
      setTrucksPage(res.page);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch trucks");
    } finally {
      setTrucksLoading(false);
    }
  }, []);

  // Transporter Handlers
  const handleOpenCreateTransporter = () => {
    setEditingTransporter(null);
    transporterForm.reset({ name: "", phone: "", gstin: "", isActive: true });
    setTransporterSheetOpen(true);
  };

  const handleOpenEditTransporter = (row: TransporterRow) => {
    setEditingTransporter(row);
    transporterForm.reset({
      name: row.name,
      phone: row.phone,
      gstin: row.gstin || "",
      isActive: row.isActive,
    });
    setTransporterSheetOpen(true);
  };

  const onSubmitTransporter = async (values: TransporterFormInput) => {
    setIsSubmitting(true);
    try {
      const result = editingTransporter
        ? await updateTransporter(editingTransporter.id, values)
        : await createTransporter(values);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Transporter "${values.name}" ${editingTransporter ? "updated" : "created"}.`);
      setTransporterSheetOpen(false);
      fetchTransporters(transportersPage, transportersSearch);
    } catch (err: any) {
      toast.error(err.message || "Failed to save transporter");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteTransporter = async () => {
    if (!deletingTransporter) return;
    setIsSubmitting(true);
    setTransporterDeleteError(null);
    try {
      await deleteTransporter(deletingTransporter.id);
      toast.success(`Transporter "${deletingTransporter.name}" deleted.`);
      setTransporterDeleteOpen(false);
      fetchTransporters(transportersPage, transportersSearch);
    } catch (err: any) {
      setTransporterDeleteError(err.message);
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Truck Handlers
  const handleOpenCreateTruck = () => {
    setEditingTruck(null);
    truckForm.reset({
      registrationNumber: "",
      capacityKg: 20000,
      transporterId: transportersList[0]?.id || "",
      isActive: true,
    });
    setTruckSheetOpen(true);
  };

  const handleOpenEditTruck = (row: TruckRow) => {
    setEditingTruck(row);
    truckForm.reset({
      registrationNumber: row.registrationNumber,
      capacityKg: row.capacityKg,
      transporterId: row.transporterId || "",
      isActive: row.isActive,
    });
    setTruckSheetOpen(true);
  };

  const onSubmitTruck = async (values: TruckFormInput) => {
    setIsSubmitting(true);
    try {
      const result = editingTruck
        ? await updateTruck(editingTruck.id, values)
        : await createTruck(values);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Truck "${values.registrationNumber}" ${editingTruck ? "updated" : "registered"}.`);
      setTruckSheetOpen(false);
      fetchTrucks(trucksPage, trucksSearch);
    } catch (err: any) {
      toast.error(err.message || "Failed to save truck");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteTruck = async () => {
    if (!deletingTruck) return;
    setIsSubmitting(true);
    setTruckDeleteError(null);
    try {
      await deleteTruck(deletingTruck.id);
      toast.success(`Truck "${deletingTruck.registrationNumber}" deleted.`);
      setTruckDeleteOpen(false);
      fetchTrucks(trucksPage, trucksSearch);
    } catch (err: any) {
      setTruckDeleteError(err.message);
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Truck Columns
  const truckColumns: ColumnDef<TruckRow>[] = [
    {
      accessorKey: "registrationNumber",
      header: "Registration No.",
      cell: ({ row }) => (
        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border">
          {row.getValue("registrationNumber")}
        </span>
      ),
    },
    {
      accessorKey: "owner",
      header: "Transporter Agency",
      cell: ({ row }) => (
        <span className="font-medium text-slate-800">
          {row.original.owner?.name || "Independent / Direct"}
        </span>
      ),
    },
    {
      accessorKey: "capacityKg",
      header: () => <div className="text-right">Payload Capacity</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono font-bold text-primary">
          {formatWeightKg(row.getValue("capacityKg"))}
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: () => <div className="text-right">Status</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Badge
            variant={row.getValue("isActive") ? "success" : "destructive"}
            className="text-[10px]"
          >
            {row.getValue("isActive") ? "Available" : "Inactive"}
          </Badge>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const t = row.original;
        if (!isAdmin) return <span className="text-xs text-muted-foreground">View only</span>;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Truck Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleOpenEditTruck(t)} className="text-xs gap-2">
                <Pencil className="h-3.5 w-3.5" /> Edit Truck
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setDeletingTruck(t);
                  setTruckDeleteError(null);
                  setTruckDeleteOpen(true);
                }}
                className="text-xs gap-2 text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Truck
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  // Transporter Columns
  const transporterColumns: ColumnDef<TransporterRow>[] = [
    {
      accessorKey: "name",
      header: "Transporter Name",
      cell: ({ row }) => (
        <span className="font-semibold text-slate-900">{row.getValue("name")}</span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 font-mono text-xs text-slate-700">
          <Phone className="h-3 w-3 text-slate-400" />
          {row.getValue("phone")}
        </div>
      ),
    },
    {
      accessorKey: "gstin",
      header: "GSTIN",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-600">
          {row.getValue("gstin") || "—"}
        </span>
      ),
    },
    {
      id: "fleetSize",
      header: () => <div className="text-right">Fleet Size</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-xs font-semibold">
          {row.original._count?.trucks || 0} Registered Trucks
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: () => <div className="text-right">Status</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Badge
            variant={row.getValue("isActive") ? "success" : "destructive"}
            className="text-[10px]"
          >
            {row.getValue("isActive") ? "Active" : "Inactive"}
          </Badge>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const tr = row.original;
        if (!isAdmin) return <span className="text-xs text-muted-foreground">View only</span>;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleOpenEditTransporter(tr)} className="text-xs gap-2">
                <Pencil className="h-3.5 w-3.5" /> Edit Transporter
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setDeletingTransporter(tr);
                  setTransporterDeleteError(null);
                  setTransporterDeleteOpen(true);
                }}
                className="text-xs gap-2 text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Transporter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as any)}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="trucks" className="gap-2 text-xs">
            <TruckIcon className="h-3.5 w-3.5" />
            Trucks ({trucksTotal})
          </TabsTrigger>
          <TabsTrigger value="transporters" className="gap-2 text-xs">
            <Building className="h-3.5 w-3.5" />
            Transporters ({transportersTotal})
          </TabsTrigger>
        </TabsList>

        {/* Trucks Tab */}
        <TabsContent value="trucks" className="pt-2">
          <DataTable
            columns={truckColumns}
            data={trucksData}
            totalRows={trucksTotal}
            page={trucksPage}
            pageSize={20}
            totalPages={Math.ceil(trucksTotal / 20) || 1}
            isLoading={trucksLoading}
            searchPlaceholder="Search registration number or transporter..."
            searchTerm={trucksSearch}
            onSearchChange={(term) => {
              setTrucksSearch(term);
              fetchTrucks(1, term);
            }}
            onPageChange={(p) => fetchTrucks(p, trucksSearch)}
            actionButton={
              isAdmin ? (
                <Button size="sm" onClick={handleOpenCreateTruck} className="gap-1.5 shadow-sm">
                  <Plus className="h-4 w-4" /> Add Truck
                </Button>
              ) : undefined
            }
          />
        </TabsContent>

        {/* Transporters Tab */}
        <TabsContent value="transporters" className="pt-2">
          <DataTable
            columns={transporterColumns}
            data={transportersData}
            totalRows={transportersTotal}
            page={transportersPage}
            pageSize={20}
            totalPages={Math.ceil(transportersTotal / 20) || 1}
            isLoading={transportersLoading}
            searchPlaceholder="Search transporter name, phone, GSTIN..."
            searchTerm={transportersSearch}
            onSearchChange={(term) => {
              setTransportersSearch(term);
              fetchTransporters(1, term);
            }}
            onPageChange={(p) => fetchTransporters(p, transportersSearch)}
            actionButton={
              isAdmin ? (
                <Button size="sm" onClick={handleOpenCreateTransporter} className="gap-1.5 shadow-sm">
                  <Plus className="h-4 w-4" /> Add Transporter
                </Button>
              ) : undefined
            }
          />
        </TabsContent>
      </Tabs>

      {/* Truck CrudSheet */}
      <CrudSheet
        open={truckSheetOpen}
        onOpenChange={setTruckSheetOpen}
        title={editingTruck ? `Edit Truck — ${editingTruck.registrationNumber}` : "Register New Truck"}
        description="Truck registration numbers are validated against Indian vehicle formats and used for load capacity checks."
        isSubmitting={isSubmitting}
        submitLabel={editingTruck ? "Update Truck" : "Register Truck"}
        onSubmit={truckForm.handleSubmit(onSubmitTruck)}
      >
        <Form {...truckForm}>
          <form onSubmit={truckForm.handleSubmit(onSubmitTruck)} className="space-y-4">
            <FormField
              control={truckForm.control}
              name="registrationNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Vehicle Registration Number *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. GJ01AB1234"
                      className="font-mono uppercase"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription className="text-[10px]">
                    Format: State code + District code + Series + 4 digits (e.g. UP14AB1234).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={truckForm.control}
              name="capacityKg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Payload Capacity (in kg) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="100"
                      placeholder="20000"
                      className="font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-[10px]">
                    e.g. 20000 kg = 20 MT payload limit.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={truckForm.control}
              name="transporterId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Transporter Agency</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value || undefined}
                  >
                    <FormControl>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Select transporter agency (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {transportersList.map((tr) => (
                        <SelectItem key={tr.id} value={tr.id} className="text-xs">
                          {tr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={truckForm.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="text-xs font-normal cursor-pointer">
                    Truck is active and available for dispatch loading.
                  </FormLabel>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CrudSheet>

      {/* Transporter CrudSheet */}
      <CrudSheet
        open={transporterSheetOpen}
        onOpenChange={setTransporterSheetOpen}
        title={editingTransporter ? `Edit Transporter — ${editingTransporter.name}` : "Add Transporter"}
        description="Transport agencies handle logistics and freight hauling for finished paper reels."
        isSubmitting={isSubmitting}
        submitLabel={editingTransporter ? "Update Transporter" : "Create Transporter"}
        onSubmit={transporterForm.handleSubmit(onSubmitTransporter)}
      >
        <Form {...transporterForm}>
          <form onSubmit={transporterForm.handleSubmit(onSubmitTransporter)} className="space-y-4">
            <FormField
              control={transporterForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Transporter Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Shree Ganesh Roadlines" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={transporterForm.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Phone Number (10 digits) *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="9825100001"
                      className="font-mono"
                      maxLength={10}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={transporterForm.control}
              name="gstin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">GSTIN (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 24AABCS1111A1Z9"
                      className="font-mono uppercase"
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={transporterForm.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="text-xs font-normal cursor-pointer">
                    Transporter is active.
                  </FormLabel>
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CrudSheet>

      {/* Delete Dialogs */}
      <ConfirmDialog
        open={truckDeleteOpen}
        onOpenChange={setTruckDeleteOpen}
        title="Delete Truck"
        description="Are you sure you want to mark this vehicle as deleted?"
        itemName={deletingTruck ? deletingTruck.registrationNumber : ""}
        isLoading={isSubmitting}
        errorMessage={truckDeleteError}
        onConfirm={confirmDeleteTruck}
      />

      <ConfirmDialog
        open={transporterDeleteOpen}
        onOpenChange={setTransporterDeleteOpen}
        title="Delete Transporter"
        description="Are you sure you want to mark this transport agency as deleted?"
        itemName={deletingTransporter ? deletingTransporter.name : ""}
        isLoading={isSubmitting}
        errorMessage={transporterDeleteError}
        onConfirm={confirmDeleteTransporter}
      />
    </div>
  );
}
