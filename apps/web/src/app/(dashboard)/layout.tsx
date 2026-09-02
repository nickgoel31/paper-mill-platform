import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgenticAiSidebar } from "@/components/ai/agentic-ai-sidebar";
import { Role } from "@/generated/prisma/browser";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  const userRole = ((session.user as any).role as Role) || Role.SALES;
  const userName = session.user.name || "Factory Staff";
  const userEmail = session.user.email || "";

  return (
    <div className="flex min-h-screen bg-slate-50/50">
      <Sidebar
        userRole={userRole}
        userName={userName}
        userEmail={userEmail}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
        />
        <main className="flex-1 p-3 sm:p-6 overflow-y-auto max-w-full">{children}</main>
      </div>

      {/* Floating Agentic AI Assistant & Right Sidebar Drawer */}
      <AgenticAiSidebar />
    </div>
  );
}
