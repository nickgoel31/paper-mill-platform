import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAnalyticsData } from "@/server/services/analytics-service";
import { AnalyticsDashboardClient } from "./analytics-dashboard-client";

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <AnalyticsDashboardClient initialData={analyticsData} />
    </div>
  );
}
