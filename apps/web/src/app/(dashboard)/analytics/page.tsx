import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAnalyticsData } from "@/server/services/analytics-service";
import { AnalyticsDashboardClient } from "./analytics-dashboard-client.lazy";

export const metadata: Metadata = {
  title: "Analytics & Business Performance | HRA Paper Mill",
  description: "Month-on-Month Business Intelligence, Sales, Wastage and Machine Efficiency",
};

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const analyticsData = await getAnalyticsData({ timeRange: "last_6_months" });
  const userName = session.user.name || "Factory Executive";

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <AnalyticsDashboardClient
        initialData={JSON.parse(JSON.stringify(analyticsData))}
        userName={userName}
      />
    </div>
  );
}
