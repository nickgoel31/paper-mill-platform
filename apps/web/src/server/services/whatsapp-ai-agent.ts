import { runWithTenantContext, type TenantContext } from "@/lib/tenant-context";
import {
  executeAgentTool,
  buildSystemPrompt,
  streamOpenAIResponse,
  RESPONSES_TOOLS,
  OPENAI_MODEL_CHAT,
  OPENAI_MODEL_DOC,
  isVisualDoc,
  MAX_AGENT_STEPS,
} from "@/app/api/ai-agent/route";
import { getReportData } from "@/server/services/report-service";
import { getDailyOrderReport, listDailyOrderReportDates } from "@/server/services/daily-order-report-service";
import { objectsToCsv } from "@/lib/csv";
import { uploadWhatsAppMedia, sendWhatsAppDocument, type WhatsAppCredentials } from "@/lib/whatsapp/client";
import type { ReportType } from "@/server/services/report-types";

export interface WhatsAppAgentFile {
  name: string;
  type: string; // mime type
  base64: string;
}

const REPORT_TOOL_NAME = "sendReportOverWhatsApp";
const REPORT_TYPES: ReportType[] = ["orders", "production", "dispatch", "wastage", "invoices", "stock", "daily-backlog"];

const SEND_REPORT_TOOL = {
  type: "function",
  function: {
    name: REPORT_TOOL_NAME,
    description:
      "Generate one of the mill's reports as a CSV file and send it back to the requester on WhatsApp as a document. Use this whenever the user asks to be sent/emailed/shared a report, export, or current data dump (e.g. \"send me the stock\", \"dispatch report for this week\", \"today's order backlog\").",
    parameters: {
      type: "object",
      required: ["reportType"],
      properties: {
        reportType: {
          type: "string",
          enum: REPORT_TYPES,
          description:
            "orders = sales orders, production = production runs, dispatch = dispatch/logistics, wastage = wastage log, invoices = invoices & payments, stock = current stock snapshot, daily-backlog = latest daily order backlog by client type",
        },
        startDate: { type: "string", description: "Optional range start (YYYY-MM-DD), for orders/production/dispatch/wastage/invoices." },
        endDate: { type: "string", description: "Optional range end (YYYY-MM-DD)." },
      },
    },
  },
};

async function buildReportCsv(reportType: ReportType, startDate?: string, endDate?: string) {
  if (reportType === "daily-backlog") {
    const dates = await listDailyOrderReportDates();
    const date = dates[0];
    if (!date) return { error: "No daily order backlog snapshot has been generated yet." };
    const rows = await getDailyOrderReport(date);
    const csv = objectsToCsv(rows as any, [
      { key: "clientType", header: "Client Type" },
      { key: "clientName", header: "Party Name" },
      { key: "monthQtyKg", header: "Qty This Month (kg)" },
      { key: "openingKg", header: "Opening (kg)" },
      { key: "newOrdersKg", header: "New Orders (kg)" },
      { key: "dispatchedKg", header: "Dispatched (kg)" },
      { key: "closingKg", header: "Closing (kg)" },
      { key: "pendingSizesKg", header: "Pending Sizes (kg)" },
    ]);
    return { csv, filename: `daily-order-backlog-${date}.csv`, rowCount: rows.length };
  }

  const result = await getReportData(reportType, { startDate, endDate });
  const csv = objectsToCsv(result.rows, result.columns);
  const rangeLabel = startDate || endDate ? `${startDate || "start"}_to_${endDate || "today"}` : "all";
  return { csv, filename: `${reportType}-report-${rangeLabel}.csv`, rowCount: result.rows.length };
}

/**
 * Runs the same tool-calling agent loop the in-app AI sidebar uses
 * (api/ai-agent/route.ts), but to completion instead of streaming — for the
 * WhatsApp webhook, which needs one final reply, not live deltas. Every tool
 * call re-asserts `tenantCtx` for the same reason the streaming route does:
 * the ambient AsyncLocalStorage store isn't guaranteed to survive the await
 * boundary around the OpenAI call on workerd.
 */
async function handleSendReportTool(
  args: { reportType?: string; startDate?: string; endDate?: string },
  toPhone: string,
  credentials?: WhatsAppCredentials | null
) {
  const reportType = args.reportType as ReportType;
  if (!REPORT_TYPES.includes(reportType)) {
    return { success: false, message: `Unknown report type "${args.reportType}".`, error: "invalid reportType" };
  }

  const built = await buildReportCsv(reportType, args.startDate, args.endDate);
  if ("error" in built) {
    return { success: false, message: built.error, error: built.error };
  }
  if (built.rowCount === 0) {
    return { success: true, message: `No rows found for "${reportType}" — nothing sent.`, data: { rowCount: 0 } };
  }

  const uploaded = await uploadWhatsAppMedia({
    content: built.csv,
    filename: built.filename,
    mimeType: "text/csv",
    credentials,
  });
  if (uploaded.error) {
    return { success: false, message: `Failed to upload report: ${uploaded.error}`, error: uploaded.error };
  }

  const sent = await sendWhatsAppDocument({
    phoneNumber: toPhone,
    mediaId: uploaded.mediaId,
    filename: built.filename,
    caption: `${reportType} report — ${built.rowCount} row(s)`,
    credentials,
  });
  if (!sent.success) {
    return { success: false, message: `Failed to send report: ${sent.error}`, error: sent.error };
  }

  return {
    success: true,
    message: `Sent "${built.filename}" (${built.rowCount} row(s)) to WhatsApp${uploaded.isDryRun ? " [dry-run]" : ""}.`,
    data: { filename: built.filename, rowCount: built.rowCount, isDryRun: uploaded.isDryRun },
  };
}

export async function runAgentTurnToCompletion(input: {
  tenantCtx: TenantContext;
  userName: string;
  userRole: string;
  userMessage: string;
  files?: WhatsAppAgentFile[];
  /** Where to send report documents this turn generates. */
  replyToPhone: string;
  whatsappCredentials?: WhatsAppCredentials | null;
}): Promise<{ replyText: string; toolResults: any[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      replyText: "AI assistant is not configured on this deployment yet (missing OPENAI_API_KEY).",
      toolResults: [],
    };
  }

  return runWithTenantContext(input.tenantCtx, async () => {
    const userContent: any[] = [];
    for (const f of input.files || []) {
      if (f.base64 && f.type?.startsWith("image/")) {
        userContent.push({ type: "input_image", image_url: `data:${f.type};base64,${f.base64}` });
      } else if (f.base64 && f.type === "application/pdf") {
        userContent.push({
          type: "input_file",
          filename: f.name || "document.pdf",
          file_data: `data:application/pdf;base64,${f.base64}`,
        });
      }
    }
    userContent.push({
      type: "input_text",
      text: input.userMessage || "Please review the attached document and take the requested action.",
    });

    const system = buildSystemPrompt(input.userName, input.userRole);
    const toolResults: any[] = [];
    const model = (input.files || []).some(isVisualDoc) ? OPENAI_MODEL_DOC : OPENAI_MODEL_CHAT;

    let requestInput: any[] = [{ role: "user", content: userContent }];
    let previousResponseId: string | null = null;

    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      let assistantText = "";
      const calls: Array<{ name: string; arguments: string; call_id: string }> = [];

      await streamOpenAIResponse(
        apiKey,
        {
          model,
          instructions: system,
          tools: [...RESPONSES_TOOLS, SEND_REPORT_TOOL],
          tool_choice: "auto",
          parallel_tool_calls: true,
          input: requestInput,
          ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
        },
        {
          onTextDelta: (delta) => {
            assistantText += delta;
          },
          onFunctionCallDone: (call) => calls.push(call),
          onResponseId: (id) => {
            previousResponseId = id;
          },
        }
      );

      if (calls.length === 0) {
        return { replyText: assistantText.trim() || "Done.", toolResults };
      }

      requestInput = [];
      for (const call of calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = {};
        }

        let out: any;
        try {
          if (call.name === REPORT_TOOL_NAME) {
            out = await runWithTenantContext(input.tenantCtx, () =>
              handleSendReportTool(args, input.replyToPhone, input.whatsappCredentials)
            );
          } else {
            out = await runWithTenantContext(input.tenantCtx, () => executeAgentTool(call.name || "", args));
          }
        } catch (e: any) {
          out = { success: false, message: "Tool crashed", error: e?.message || String(e) };
        }
        toolResults.push({ name: call.name, ...out });
        requestInput.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(out).slice(0, 16000),
        });
      }
    }

    return {
      replyText: "I ran several steps but hit the step limit before finishing. Please send a more specific request.",
      toolResults,
    };
  });
}
