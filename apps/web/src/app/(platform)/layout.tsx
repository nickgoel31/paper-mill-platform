import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePlatform } from "@/server/auth-helpers";
import { Building2 } from "lucide-react";
import { PlatformSignOut } from "@/components/platform/platform-sign-out";

export const metadata = {
  title: "Platform Console | PaperMill ERP",
};

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requirePlatform();
  } catch {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-50/60">
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6">
        <Link href="/platform" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-extrabold text-[15px] tracking-tight text-slate-900">
              TWJ Labs — Platform
            </span>
            <span className="text-[11px] text-slate-400 font-medium mt-1">
              Paper Mill Tenant Management
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">{user.email}</span>
          <PlatformSignOut />
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">{children}</main>
    </div>
  );
}
