"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { CrudSheet } from "@/components/data-table/crud-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  CreateUserInput,
  UpdateUserInput,
  ResetPasswordInput,
} from "@/lib/schemas/user";
import {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
} from "@/server/services/user-service";
import { Role } from "@/generated/prisma/browser";
import {
  Users as UsersIcon,
  Plus,
  MoreHorizontal,
  Pencil,
  KeyRound,
  Shield,
  Loader2,
} from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string | Date;
}

interface UsersManagerProps {
  initialData: {
    rows: UserRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  currentUserId: string;
}

const ROLES_LIST = [
  { value: Role.ADMIN, label: "ADMIN (Full system access)" },
  { value: Role.PLANNER, label: "PLANNER (Deckle solver, runs & stock)" },
  { value: Role.SALES, label: "SALES (Orders, clients & billing)" },
  { value: Role.OPERATOR, label: "OPERATOR (Machine production floor)" },
  { value: Role.DISPATCH, label: "DISPATCH (Load batches & gate pass)" },
];

function getRoleBadge(role: Role) {
  switch (role) {
    case Role.ADMIN:
      return "bg-purple-100 text-purple-900 border-purple-300";
    case Role.PLANNER:
      return "bg-blue-100 text-blue-900 border-blue-300";
    case Role.OPERATOR:
      return "bg-amber-100 text-amber-900 border-amber-300";
    case Role.SALES:
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case Role.DISPATCH:
      return "bg-sky-100 text-sky-900 border-sky-300";
  }
}

export function UsersManager({ initialData, currentUserId }: UsersManagerProps) {
  const [data, setData] = React.useState(initialData.rows);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(initialData.page);
  const [pageSize, setPageSize] = React.useState(initialData.pageSize);
  const [totalPages, setTotalPages] = React.useState(initialData.totalPages);
  const [search, setSearch] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // Sheet State
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserRow | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Password Reset Dialog State
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);
  const [resettingUser, setResettingUser] = React.useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = React.useState("");
  const [resetLoading, setResetLoading] = React.useState(false);

  // Forms
  const createForm = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: Role.SALES,
      password: "",
      isActive: true,
    },
  });

  const editForm = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: "",
      email: "",
      role: Role.SALES,
      isActive: true,
    },
  });

  const fetchData = React.useCallback(async (newPage: number, searchTerm: string) => {
    setIsLoading(true);
    try {
      const res = await getUsers({ page: newPage, pageSize, search: searchTerm });
      setData(res.rows as any);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch users");
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
    setEditingUser(null);
    createForm.reset({
      name: "",
      email: "",
      role: Role.SALES,
      password: "password123",
      isActive: true,
    });
    setSheetOpen(true);
  };

  // Open Edit
  const handleOpenEdit = (user: UserRow) => {
    setEditingUser(user);
    editForm.reset({
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    });
    setSheetOpen(true);
  };

  // Submit Create
  const onSubmitCreate = async (values: CreateUserInput) => {
    setIsSubmitting(true);
    try {
      await createUser(values);
      toast.success(`User "${values.name}" created successfully.`);
      setSheetOpen(false);
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Edit
  const onSubmitEdit = async (values: UpdateUserInput) => {
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      await updateUser(editingUser.id, values);
      toast.success(`User "${values.name}" updated successfully.`);
      setSheetOpen(false);
      fetchData(page, search);
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Password Reset Handler
  const handleOpenReset = (user: UserRow) => {
    setResettingUser(user);
    setNewPassword("");
    setResetDialogOpen(true);
  };

  const onConfirmResetPassword = async () => {
    if (!resettingUser) return;
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setResetLoading(true);
    try {
      await resetUserPassword({
        userId: resettingUser.id,
        newPassword,
      });
      toast.success(`Password for ${resettingUser.email} has been updated.`);
      setResetDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  // Columns definition
  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: "name",
      header: "User Name",
      cell: ({ row }) => (
        <div>
          <span className="font-semibold text-slate-900">{row.getValue("name")}</span>
          {row.original.id === currentUserId && (
            <span className="ml-2 text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">
              (You)
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email (Login ID)",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-700">{row.getValue("email")}</span>
      ),
    },
    {
      accessorKey: "role",
      header: "Assigned Role",
      cell: ({ row }) => {
        const role = row.getValue("role") as Role;
        return (
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${getRoleBadge(
              role
            )}`}
          >
            {role}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.getValue("createdAt")).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: () => <div className="text-right">Account Status</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Badge
            variant={row.getValue("isActive") ? "success" : "destructive"}
            className="text-[10px]"
          >
            {row.getValue("isActive") ? "Active" : "Disabled"}
          </Badge>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const u = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">User Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleOpenEdit(u)} className="text-xs gap-2">
                <Pencil className="h-3.5 w-3.5" /> Edit Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleOpenReset(u)} className="text-xs gap-2">
                <KeyRound className="h-3.5 w-3.5" /> Reset Password
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
        searchPlaceholder="Search by name or email..."
        searchTerm={search}
        onSearchChange={handleSearchChange}
        onPageChange={handlePageChange}
        actionButton={
          <Button size="sm" onClick={handleOpenCreate} className="gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Add User
          </Button>
        }
      />

      {/* CrudSheet for Create/Edit */}
      <CrudSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editingUser ? `Edit User — ${editingUser.name}` : "Create Staff Account"}
        description="User accounts authenticate factory staff and enforce role-based access permissions across modules."
        isSubmitting={isSubmitting}
        submitLabel={editingUser ? "Update User" : "Create Account"}
        onSubmit={
          editingUser
            ? editForm.handleSubmit(onSubmitEdit)
            : createForm.handleSubmit(onSubmitCreate)
        }
      >
        {editingUser ? (
          // Edit Form
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Staff Full Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Ramesh Patel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Email (Login ID) *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="e.g. admin@papermill.local"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Role Assignment *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={editingUser.id === currentUserId}
                    >
                      <FormControl>
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Select system role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES_LIST.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editingUser.id === currentUserId && (
                      <FormDescription className="text-[10px] text-amber-600">
                        You cannot change the role of your own admin account.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={editingUser.id === currentUserId}
                      />
                    </FormControl>
                    <FormLabel className="text-xs font-normal cursor-pointer">
                      Account is active and permitted to log in.
                    </FormLabel>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        ) : (
          // Create Form
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onSubmitCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Staff Full Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Anand Sharma" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Email (Login ID) *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="e.g. anand@papermill.local"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Role Assignment *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="Select system role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES_LIST.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Initial Password (min 6 chars) *</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[10px]">
                      Hashed securely with bcrypt before storing.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="text-xs font-normal cursor-pointer">
                      Account is active and permitted to log in.
                    </FormLabel>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        )}
      </CrudSheet>

      {/* Password Reset Modal */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <KeyRound className="h-5 w-5" />
              <DialogTitle className="text-base font-bold">
                Reset Account Password
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Set a new password for account:{" "}
              <strong className="text-slate-900">{resettingUser?.email}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold">New Password (min 6 chars)</label>
              <Input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={resetLoading}
              onClick={() => setResetDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={resetLoading}
              onClick={onConfirmResetPassword}
            >
              {resetLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
