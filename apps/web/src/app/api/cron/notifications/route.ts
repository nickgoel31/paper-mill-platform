import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/server/services/notification-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await processNotificationQueue(50);
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process notifications queue" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
