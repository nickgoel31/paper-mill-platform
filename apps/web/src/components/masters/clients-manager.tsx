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
import { clientSchema, ClientFormInput } from "@/lib/schemas/client";
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
} from "@/server/services/client-service";
import { INDIAN_STATES } from "@/lib/constants";
import {
  Building2,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Phone,
  MessageSquare,
} from "lucide-react";

interface ClientRow {
  id: string;
  name: string;
  code: string;
  gstin: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  contactPerson: string | null;
  phone: string;
  whatsappNumber: string;
  email: string | null;
  isActive: boolean;
  _count?: { orders: number };
}

interface ClientsManagerProps {
  initialData: {
    rows: ClientRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  isAdmin: boolean;
}

export function ClientsManager({ initialData, isAdmin }: ClientsManagerProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Sheet & Dialog State
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingClient, setEditingClient] = React.useState<ClientRow | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingClient, setDeletingClient] = React.useState<ClientRow | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [sameAsPhone, setSameAsPhone] = React.useState(true);

  const form = useForm<ClientFormInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      code: "",
      gstin: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "Gujarat",
      pincode: "",
      contactPerson: "",
      phone: "",
      whatsappNumber: "",
      email: "",
      isActive: true,
    },
  });

  const fetchData = React.useCallback(async (newPage: number, searchTerm: string) => {
    setIsLoading(true);
    try {
      const res = await getClients({ page: newPage, pageSize, search: searchTerm });
      setData(res.rows as any);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch clients");
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  const handleSearchChange = (term: string) => {
    setSearch(term);
    fetchData(1, term);
  };

  const handlePageChange = (newPage: number) => {
    fetchData(newPage, search);
  };

  // Open Create
  const handleOpenCreate = () => {
    setEditingClient(null);
    setSameAsPhone(true);
    form.reset({
      name: "",
      code: "",
      gstin: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "Gujarat",
      pincode: "",
      contactPerson: "",
      phone: "",
      whatsappNumber: "",
      email: "",
      isActive: true,
    });
    setSheetOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (client: ClientRow) => {
    setEditingClient(client);
    setSameAsPhone(client.whatsappNumber === client.phone);
    form.reset({
      name: client.name,
      code: client.code,
      gstin: client.gstin || "",
      addressLine1: client.addressLine1,
      addressLine2: client.addressLine2 || "",
      city: client.city,
      state: client.state,
      pincode: client.pincode,
      contactPerson: client.contactPerson || "",
      phone: client.phone,
      whatsappNumber: client.whatsappNumber,
      email: client.email || "",
      isActive: client.isActive,
    });
    setSheetOpen(true);
  };

  // Auto-generate code from name in create mode
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    form.setValue("name", val);
    if (!editingClient) {
      const cleaned = val
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .slice(0, 6);
      if (cleaned) {
        form.setValue("code", `${cleaned}-01`, { shouldValidate: true });
      }
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
    form.setValue("phone", val);
    if (sameAsPhone) {
      form.setValue("whatsappNumber", val ? `91${val}` : "");
    }
  };

  // Submit Handler
  const onSubmit = async (values: ClientFormInput) => {
    setIsSubmitting(true);
    try {
      const result = editingClient
        ? await updateClient(editingClient.id, values)
        : await createClient(values);

      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Client "${values.name}" ${editingClient ? "updated" : "created"} successfully.`);
      setSheetOpen(false);
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to save client.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Delete
  const handleOpenDelete = (client: ClientRow) => {
    setDeletingClient(client);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingClient) return;
    setIsSubmitting(true);
    setDeleteError(null);
    try {
      await deleteClient(deletingClient.id);
      toast.success(`Client "${deletingClient.name}" deleted successfully.`);
      setDeleteDialogOpen(false);
      fetchData(page, search);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete client.");
      toast.error(err.message || "Failed to delete client.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Columns definition
  const columns: ColumnDef<ClientRow>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono font-bold text-primary">
          {row.getValue("code")}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Client Name",
      cell: ({ row }) => (
        <div>
          <div className="font-semibold text-slate-900">{row.getValue("name")}</div>
          {row.original.contactPerson && (
            <div className="text-[11px] text-muted-foreground">
              Attn: {row.original.contactPerson}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "city",
      header: "Location",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.city}, {row.original.state}
        </span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone / WhatsApp",
      cell: ({ row }) => (
        <div className="font-mono text-[11px] space-y-0.5">
          <div className="flex items-center gap-1 text-slate-700">
            <Phone className="h-3 w-3 text-slate-400" />
            {row.original.phone}
          </div>
          <div className="flex items-center gap-1 text-emerald-700 font-semibold">
            <MessageSquare className="h-3 w-3 text-emerald-500" />
            {row.original.whatsappNumber}
          </div>
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
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={row.getValue("isActive") ? "success" : "destructive"}
          className="text-[10px]"
        >
          {row.getValue("isActive") ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const client = row.original;
        if (!isAdmin) {
          return <span className="text-xs text-muted-foreground">View only</span>;
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">Client Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handleOpenEdit(client)}
                className="text-xs gap-2"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Client
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleOpenDelete(client)}
                className="text-xs gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={data}
        totalRows={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        isLoading={isLoading}
        searchPlaceholder="Search by name, code, GSTIN, city, phone..."
        searchTerm={search}
        onSearchChange={handleSearchChange}
        onPageChange={handlePageChange}
        actionButton={
          isAdmin ? (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          ) : undefined
        }
      />

      {/* Reusable CrudSheet for Create & Edit */}
      <CrudSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editingClient ? `Edit Client — ${editingClient.name}` : "Create New Client"}
        description="Client details will be used for auto-invoicing, truck load assignments, and WhatsApp dispatch alerts."
        isSubmitting={isSubmitting}
        submitLabel={editingClient ? "Update Client" : "Create Client"}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-xs font-semibold">Client / Company Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Amber Packaging Industries"
                        {...field}
                        onChange={handleNameChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Client Code (Unique) *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. AMBER-01"
                        className="font-mono uppercase"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      Unique uppercase code used on cutting plans.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gstin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">GSTIN (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 24AABCA1234F1Z5"
                        className="font-mono uppercase"
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
              <FormField
                control={form.control}
                name="contactPerson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Contact Person</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Kishore Dave" value={field.value || ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Email Address</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="e.g. orders@client.com"
                        value={field.value || ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Mobile Phone (10 digits) *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="9825011223"
                        className="font-mono"
                        {...field}
                        onChange={handlePhoneChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsappNumber"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-xs font-semibold">WhatsApp Number *</FormLabel>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                        <Checkbox
                          checked={sameAsPhone}
                          onCheckedChange={(checked) => {
                            setSameAsPhone(!!checked);
                            if (checked) {
                              const p = form.getValues("phone");
                              form.setValue("whatsappNumber", p ? `91${p}` : "");
                            }
                          }}
                        />
                        Same as phone
                      </label>
                    </div>
                    <FormControl>
                      <Input
                        placeholder="919825011223"
                        className="font-mono"
                        disabled={sameAsPhone}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3 pt-2 border-t">
              <FormField
                control={form.control}
                name="addressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Address Line 1 *</FormLabel>
                    <FormControl>
                      <Input placeholder="Plot 42, GIDC Industrial Estate" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="addressLine2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Address Line 2 (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Phase 2, Near Overbridge" value={field.value || ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">City *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ahmedabad" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">State *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-56">
                          {INDIAN_STATES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pincode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold">PIN Code *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="382445"
                          maxLength={6}
                          className="font-mono"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="pt-2 border-t">
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="text-xs font-normal cursor-pointer">
                      Client is active and eligible for new orders and truck loadings.
                    </FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </CrudSheet>

      {/* Confirmation Dialog for Soft Delete */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Client Master"
        description="Are you sure you want to mark this client as deleted? Soft-deleted clients cannot receive new orders."
        itemName={deletingClient ? `${deletingClient.name} (${deletingClient.code})` : ""}
        isLoading={isSubmitting}
        errorMessage={deleteError}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
