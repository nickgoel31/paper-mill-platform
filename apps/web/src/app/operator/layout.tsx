import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { OperatorHeader } from "@/components/operator/operator-header";

export const metadata = {
  title: "Machine Operator Floor | PaperMill ERP",
};

export default async function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Allow OPERATOR, ADMIN, PLANNER
  await requireRole(Role.OPERATOR, Role.ADMIN, Role.PLANNER);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased select-none font-sans">
      <OperatorHeader />
      <main className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        {children}
      </main>
    </div>
  );
}
