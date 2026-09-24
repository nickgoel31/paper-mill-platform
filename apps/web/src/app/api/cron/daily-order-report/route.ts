import { NextResponse } from "next/server";
import { generateDailyOrderReportForAllTenants } from "@/server/services/daily-order-report-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || undefined;
    const result = await generateDailyOrderReportForAllTenants(date);
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate daily order report" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
