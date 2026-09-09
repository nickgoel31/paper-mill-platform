"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateTenant,
  setTenantActive,
  createTenantUser,
  updateTenantUser,
  resetTenantUserPassword,
} from "@/server/services/platform-service";
import { Role } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Loader2, KeyRound, Plus } from "lucide-react";

type Tenant = {
  id: string;
  name: string;
  code: string;
  slug: string;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};
type MillUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
};

const F = ({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block space-y-1">
    <span className="text-xs font-bold text-slate-700">{label}</span>
    <Input {...props} className="h-10 text-sm rounded-xl bg-slate-50/70 border-slate-200" />
  </label>
);

export function MillDetailView({ tenant, users }: { tenant: Tenant; users: MillUser[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [addingUser, setAddingUser] = React.useState(false);
  const [resetFor, setResetFor] = React.useState<MillUser | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSaveMill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run(
      () =>
        updateTenant(tenant.id, {
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          slug: String(fd.get("slug") || ""),
          gstin: String(fd.get("gstin") || ""),
          address: String(fd.get("address") || ""),
          city: String(fd.get("city") || ""),
          state: String(fd.get("state") || ""),
          phone: String(fd.get("phone") || ""),
          email: String(fd.get("email") || ""),
        } as any),
      "Mill updated."
    );
  }

  async function onAddUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const okDone = await run(
      () =>
        createTenantUser(tenant.id, {
          name: String(fd.get("name") || ""),
          email: String(fd.get("email") || ""),
          role: String(fd.get("role") || Role.SALES) as Role,
          password: String(fd.get("password") || ""),
          isActive: true,
        } as any),
      "User added."
    );
    if (okDone) setAddingUser(false);
  }

  async function onReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resetFor) return;
    const fd = new FormData(e.currentTarget);
    const okDone = await run(
      () =>
        resetTenantUserPassword(tenant.id, {
          userId: resetFor.id,
          newPassword: String(fd.get("newPassword") || ""),
        }),
      "Password reset."
    );
    if (okDone) setResetFor(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="rounded-xl">
            <Link href="/platform">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{tenant.name}</h1>
          {!tenant.isActive && (
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
              DISABLED
            </span>
          )}
        </div>
        <Button
          variant={tenant.isActive ? "outline" : "default"}
          disabled={busy}
          className="rounded-xl"
          onClick={() =>
            run(
              () => setTenantActive(tenant.id, !tenant.isActive),
              tenant.isActive ? "Mill disabled." : "Mill enabled."
            )
          }
        >
          {tenant.isActive ? "Disable mill" : "Enable mill"}
        </Button>
      </div>

      <form onSubmit={onSaveMill} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Mill details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Mill name *" name="name" required defaultValue={tenant.name} />
          <F label="Code *" name="code" required defaultValue={tenant.code} maxLength={12} />
          <F label="Slug" name="slug" defaultValue={tenant.slug} />
          <F label="GSTIN" name="gstin" defaultValue={tenant.gstin ?? ""} />
          <F label="City" name="city" defaultValue={tenant.city ?? ""} />
          <F label="State" name="state" defaultValue={tenant.state ?? ""} />
          <F label="Phone" name="phone" defaultValue={tenant.phone ?? ""} />
          <F label="Billing email" name="email" type="email" defaultValue={tenant.email ?? ""} />
        </div>
        <F label="Address" name="address" defaultValue={tenant.address ?? ""} />
        <Button type="submit" disabled={busy} className="rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save
        </Button>
      </form>

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Users ({users.length})</h2>
          <Button size="sm" className="rounded-xl" onClick={() => setAddingUser((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Add user
          </Button>
        </div>

        {addingUser && (
          <form onSubmit={onAddUser} className="p-5 border-b border-slate-100 bg-slate-50/50 grid sm:grid-cols-5 gap-3 items-end">
            <F label="Name" name="name" required />
            <F label="Email" name="email" type="email" required />
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Role</span>
              <Select name="role" defaultValue={Role.SALES}>
                <SelectTrigger className="h-10 text-sm rounded-xl bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Role).map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <F label="Temp password" name="password" required minLength={6} />
            <Button type="submit" disabled={busy} className="h-10 rounded-xl">Create</Button>
          </form>
        )}

        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Name</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Email</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Role</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Active</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="text-sm">
                <TableCell className="font-semibold text-slate-900">{u.name}</TableCell>
                <TableCell className="text-slate-600">{u.email}</TableCell>
                <TableCell>
                  <Select
                    defaultValue={u.role}
                    onValueChange={(role) =>
                      run(
                        () =>
                          updateTenantUser(tenant.id, {
                            userId: u.id,
                            name: u.name,
                            role: role as Role,
                            isActive: u.isActive,
                          }),
                        "Role updated."
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-32 text-xs rounded-lg border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(Role).map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          updateTenantUser(tenant.id, {
                            userId: u.id,
                            name: u.name,
                            role: u.role,
                            isActive: !u.isActive,
                          }),
                        u.isActive ? "User deactivated." : "User activated."
                      )
                    }
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      u.isActive
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-slate-500 bg-slate-50 border-slate-200"
                    }`}
                  >
                    {u.isActive ? "ACTIVE" : "INACTIVE"}
                  </button>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs rounded-lg"
                    onClick={() => setResetFor(u)}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset password
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {resetFor && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={onReset}
            className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 border border-slate-200"
          >
            <h3 className="text-sm font-bold text-slate-900">
              Reset password — {resetFor.name}
            </h3>
            <F label="New password" name="newPassword" required minLength={6} autoFocus />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setResetFor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="rounded-xl">
                Reset
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
