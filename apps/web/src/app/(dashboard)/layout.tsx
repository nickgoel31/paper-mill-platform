import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/server/auth-helpers";
import { listMillsForSwitcher } from "@/server/services/platform-service";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgenticAiSidebar } from "@/components/ai/agentic-ai-sidebar";
import { ViewAsBanner } from "@/components/platform/view-as-banner";
import { Role } from "@/generated/prisma/browser";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Effective user: platform staff inside a mill ("view as mill") count as that
  // mill's admin.
  const user = await getEffectiveUser();

  if (!user) {
    redirect("/login");
  }

  // Platform staff outside a mill belong in the platform console.
  if (user.isPlatform || !user.tenantId) {
    redirect("/platform");
  }

  const userRole = user.role || Role.SALES;
  const userName = user.name || "Factory Staff";
  const userEmail = user.email || "";
  const viewingMills = user.viewingAs ? await listMillsForSwitcher() : null;

  return (
    <div className="flex flex-col min-h-screen bg-[#F7F7F5]">
      {viewingMills && (
        <ViewAsBanner currentMillId={user.tenantId} mills={viewingMills} />
      )}
      <div className="flex flex-1 min-h-0">
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
    </div>
  );
}
