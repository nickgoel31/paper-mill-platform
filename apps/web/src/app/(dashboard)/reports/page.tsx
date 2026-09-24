import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getReportData } from "@/server/services/report-service";
import { ReportsClient } from "./reports-client";

export const metadata: Metadata = {
  title: "Reports | HRA Paper Mill",
  description: "Orders, production, dispatch, wastage, invoices and stock reports",
};

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const initialData = await getReportData("orders");

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Reports</h1>
        <p className="text-sm text-slate-500 mt-1">
          Generate and export reports across orders, production, logistics, wastage, invoices and stock.
        </p>
      </div>
      <ReportsClient
        initialType="orders"
        initialData={JSON.parse(JSON.stringify(initialData))}
      />
    </div>
  );
}
