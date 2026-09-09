import Link from "next/link";
import { listTenants } from "@/server/services/platform-service";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, ArrowRight } from "lucide-react";

export const metadata = { title: "Paper Mills | Platform" };

export default async function PlatformHomePage() {
  const tenants = await listTenants();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Paper Mills</h1>
          <p className="text-sm text-slate-500">
            {tenants.length} mill{tenants.length === 1 ? "" : "s"} on the platform
          </p>
        </div>
        <Button asChild className="rounded-xl">
          <Link href="/platform/mills/new">
            <Plus className="h-4 w-4 mr-1.5" /> Add Mill
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Mill</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Code</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Location</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Users</TableHead>
              <TableHead className="text-right text-[11px] font-bold uppercase text-slate-500">Orders</TableHead>
              <TableHead className="text-[11px] font-bold uppercase text-slate-500">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id} className="hover:bg-slate-50/60">
                <TableCell className="font-bold text-slate-900">
                  <Link href={`/platform/mills/${t.id}`} className="hover:text-sky-600">
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-600">{t.code}</TableCell>
                <TableCell className="text-xs text-slate-500">
                  {[t.city, t.state].filter(Boolean).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{t.userCount}</TableCell>
                <TableCell className="text-right font-mono text-sm">{t.orderCount}</TableCell>
                <TableCell>
                  {t.isActive ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      ACTIVE
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                      DISABLED
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Link href={`/platform/mills/${t.id}`} className="text-slate-400 hover:text-slate-700">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-slate-400 py-10">
                  No mills yet. Add the first one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
