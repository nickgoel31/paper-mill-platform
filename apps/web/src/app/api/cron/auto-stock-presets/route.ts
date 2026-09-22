import { NextResponse } from "next/server";
import { generateMonthlyStockPresets } from "@/server/services/stock-preset-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const topN = url.searchParams.get("topN");
    const monthsBack = url.searchParams.get("monthsBack");
    const result = await generateMonthlyStockPresets({
      topN: topN ? parseInt(topN, 10) : undefined,
      monthsBack: monthsBack ? parseInt(monthsBack, 10) : undefined,
    });
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to auto-generate stock presets" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
