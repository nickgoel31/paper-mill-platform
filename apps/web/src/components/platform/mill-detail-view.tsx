"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  updateTenant,
  setTenantActive,
  setTenantPostProductionMode,
  createTenantUser,
  updateTenantUser,
  resetTenantUserPassword,
  updateTenantWhatsAppSettings,
  factoryResetTenantData,
} from "@/server/services/platform-service";
import { FACTORY_RESET_CATEGORY_INFO, type FactoryResetCategory } from "@/lib/factory-reset";
import { Role, PostProductionMode } from "@/generated/prisma/browser";
import { EnterMillButton } from "@/components/platform/enter-mill-button";
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
import { ArrowLeft, Loader2, KeyRound, Plus, MessageCircle, AlertTriangle, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type Tenant = {
  id: string;
  name: string;
  code: string;
  slug: string;
  gstin: string | null;
  cin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  postProductionMode: PostProductionMode;
  whatsappEnabled: boolean;
  whatsappAccessToken: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappApiVersion: string | null;
};

const MODE_OPTIONS: { value: PostProductionMode; label: string; hint: string }[] = [
  {
    value: PostProductionMode.AUTO_DISPATCH,
    label: "Auto-allocate to orders",
    hint: "When a run completes, reels are allocated to their sales orders and are ready for dispatch.",
  },
  {
    value: PostProductionMode.INVENTORY,
    label: "Store in inventory",
    hint: "Reels are stored as available stock. Staff match them to sales orders manually before dispatch.",
  },
];
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
  const [waEnabled, setWaEnabled] = React.useState(tenant.whatsappEnabled);

  // Factory reset (Danger Zone)
  const [resetCategories, setResetCategories] = React.useState<Set<FactoryResetCategory>>(new Set());
  const [resetConfirmCode, setResetConfirmCode] = React.useState("");
  const [isResetting, setIsResetting] = React.useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);

  const toggleResetCategory = (cat: FactoryResetCategory) =>
    setResetCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      const res: any = await fn();
      // These actions return { error } / { success: false } instead of
      // throwing (a thrown Server Action error is redacted to a generic
      // message in production), so check the result shape, not just catch.
      if (res && (res.error || res.success === false)) {
        toast.error(res.error || "Failed");
        return false;
      }
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
          cin: String(fd.get("cin") || ""),
          address: String(fd.get("address") || ""),
          city: String(fd.get("city") || ""),
          state: String(fd.get("state") || ""),
          phone: String(fd.get("phone") || ""),
          email: String(fd.get("email") || ""),
        } as any),
      "Mill updated."
    );
  }

  async function onSaveWhatsApp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await run(
      () =>
        updateTenantWhatsAppSettings(tenant.id, {
          whatsappEnabled: waEnabled,
          whatsappAccessToken: String(fd.get("whatsappAccessToken") || ""),
          whatsappPhoneNumberId: String(fd.get("whatsappPhoneNumberId") || ""),
          whatsappApiVersion: String(fd.get("whatsappApiVersion") || ""),
        }),
      "WhatsApp settings saved."
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

  async function onFactoryReset() {
    setIsResetting(true);
    try {
      const res = await factoryResetTenantData({
        tenantId: tenant.id,
        categories: Array.from(resetCategories),
        confirmCode: resetConfirmCode,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const counts = res.counts || {};
      const summary = Object.entries(counts)
        .filter(([, n]) => (n as number) > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(", ");
      toast.success(summary ? `Factory reset done — deleted ${summary}.` : "Factory reset done — nothing matched.");
      setResetConfirmOpen(false);
      setResetCategories(new Set());
      setResetConfirmCode("");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Factory reset failed");
    } finally {
      setIsResetting(false);
    }
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
        <div className="flex items-center gap-2">
          <EnterMillButton tenantId={tenant.id} disabled={!tenant.isActive} size="default" />
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
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">After production</h2>
          <p className="text-xs text-slate-500">
            What happens to finished reels when a production run is completed. Operators can still
            override this per run. Changing it only affects runs completed from now on.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {MODE_OPTIONS.map((opt) => {
            const selected = tenant.postProductionMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={busy || selected}
                onClick={() =>
                  run(
                    () => setTenantPostProductionMode(tenant.id, opt.value),
                    `Mode set to "${opt.label}".`
                  )
                }
                className={`text-left p-4 rounded-xl border-2 transition-colors ${
                  selected
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="text-sm font-bold text-slate-900">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-1">{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </section>

      <form onSubmit={onSaveMill} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Mill details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <F label="Mill name *" name="name" required defaultValue={tenant.name} />
          <F label="Code *" name="code" required defaultValue={tenant.code} maxLength={12} />
          <F label="Slug" name="slug" defaultValue={tenant.slug} />
          <F label="GSTIN" name="gstin" defaultValue={tenant.gstin ?? ""} />
          <F label="CIN" name="cin" defaultValue={tenant.cin ?? ""} />
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

      <form onSubmit={onSaveWhatsApp} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">WhatsApp notifications</h2>
          </div>
          <button
            type="button"
            onClick={() => setWaEnabled((v) => !v)}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${
              waEnabled
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : "text-slate-500 bg-slate-50 border-slate-200"
            }`}
          >
            {waEnabled ? "ENABLED" : "DISABLED"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Per-mill WhatsApp Cloud API credentials (Meta Business). Dispatch confirmations and other
          alerts for this mill send from its own WhatsApp Business number once enabled here. A
          separate global safety switch (<code className="font-mono">WHATSAPP_DRY_RUN=false</code>)
          must also be set on the Worker before any mill can send for real — until then, every mill
          logs a simulated send instead.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <F
            label="Access Token *"
            name="whatsappAccessToken"
            type="password"
            defaultValue={tenant.whatsappAccessToken ?? ""}
            placeholder="EAAG..."
          />
          <F
            label="Phone Number ID *"
            name="whatsappPhoneNumberId"
            defaultValue={tenant.whatsappPhoneNumberId ?? ""}
            placeholder="1029384756"
          />
          <F
            label="Graph API Version"
            name="whatsappApiVersion"
            defaultValue={tenant.whatsappApiVersion ?? ""}
            placeholder="v21.0 (default)"
          />
        </div>
        <Button type="submit" disabled={busy} className="rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save WhatsApp Settings
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

      <section className="bg-white rounded-2xl border-2 border-rose-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4.5 w-4.5 text-rose-600" />
          <h2 className="text-sm font-bold text-rose-700">Danger Zone — Factory Reset</h2>
        </div>
        <p className="text-xs text-slate-500">
          Permanently deletes this mill's own transactional data, category by category. Masters
          (clients, machines, trucks, GSM chart, warehouse locations, paper types), users, and
          settings are never touched — only the day-to-day data generated in the categories you
          pick below. This cannot be undone; there is no backup taken automatically.
        </p>

        <div className="grid sm:grid-cols-2 gap-2">
          {(Object.keys(FACTORY_RESET_CATEGORY_INFO) as FactoryResetCategory[]).map((cat) => {
            const info = FACTORY_RESET_CATEGORY_INFO[cat];
            const checked = resetCategories.has(cat);
            return (
              <label
                key={cat}
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer ${
                  checked ? "border-rose-300 bg-rose-50/60" : "border-slate-200 bg-slate-50/40"
                }`}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggleResetCategory(cat)} className="mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-900">{info.label}</div>
                  <div className="text-[11px] text-slate-500">{info.description}</div>
                </div>
              </label>
            );
          })}
        </div>

        <Button
          variant="destructive"
          disabled={resetCategories.size === 0}
          onClick={() => setResetConfirmOpen(true)}
          className="rounded-xl gap-1.5"
        >
          <Trash2 className="h-4 w-4" /> Factory Reset Selected Data
        </Button>
      </section>

      {resetConfirmOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 border border-rose-200">
            <h3 className="text-sm font-bold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4.5 w-4.5" /> Confirm Factory Reset — {tenant.name}
            </h3>
            <p className="text-xs text-slate-600">
              This will permanently delete: {Array.from(resetCategories).map((c) => FACTORY_RESET_CATEGORY_INFO[c].label).join(", ")}.
              This cannot be undone.
            </p>
            <F
              label={`Type the mill code "${tenant.code}" to confirm`}
              name="confirmCode"
              value={resetConfirmCode}
              onChange={(e) => setResetConfirmCode(e.target.value)}
              placeholder={tenant.code}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={isResetting}
                onClick={() => {
                  setResetConfirmOpen(false);
                  setResetConfirmCode("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl gap-1.5"
                disabled={isResetting || resetConfirmCode.trim().toUpperCase() !== tenant.code.toUpperCase()}
                onClick={onFactoryReset}
              >
                {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirm Factory Reset
              </Button>
            </div>
          </div>
        </div>
      )}

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
