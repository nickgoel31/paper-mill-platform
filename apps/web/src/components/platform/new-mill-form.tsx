"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createTenant } from "@/server/services/platform-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2 } from "lucide-react";

const F = ({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <label className="block space-y-1">
    <span className="text-xs font-bold text-slate-700">{label}</span>
    <Input {...props} className="h-10 text-sm rounded-xl bg-slate-50/70 border-slate-200" />
  </label>
);

export function NewMillForm() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const result: any = await createTenant({
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
        adminName: String(fd.get("adminName") || ""),
        adminEmail: String(fd.get("adminEmail") || ""),
        adminPassword: String(fd.get("adminPassword") || ""),
      } as any);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Mill "${result.tenant.name}" created.`);
      router.push(`/platform/mills/${result.tenant.id}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create mill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <Link href="/platform">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Link>
        </Button>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Add Paper Mill</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Mill details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <F label="Mill name *" name="name" required placeholder="Acme Paper Mill" />
            <F label="Code *" name="code" required placeholder="ACME" maxLength={12} />
            <F label="Slug (optional)" name="slug" placeholder="acme (auto from name)" />
            <F label="GSTIN" name="gstin" />
            <F label="CIN" name="cin" />
            <F label="City" name="city" />
            <F label="State" name="state" />
            <F label="Phone" name="phone" />
            <F label="Billing email" name="email" type="email" />
          </div>
          <F label="Address" name="address" />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">First admin user</h2>
          <p className="text-xs text-slate-500">
            This person can log in and manage the mill. They cannot use an @twjlabs.com address.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <F label="Name *" name="adminName" required />
            <F label="Email *" name="adminEmail" type="email" required />
            <F label="Temp password *" name="adminPassword" required minLength={6} />
          </div>
        </section>

        <Button type="submit" disabled={busy} className="h-11 px-7 rounded-xl">
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Create Mill
        </Button>
      </form>
    </div>
  );
}
