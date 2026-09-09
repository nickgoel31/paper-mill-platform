import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runWithTenantContext } from "@/lib/tenant-context";
import {
  agentGetOrders,
  agentCreateOrder,
  agentUpdateOrder,
  agentDeleteOrder,
  agentGetClients,
  agentCreateClient,
  agentUpdateClient,
  agentDeleteClient,
  agentGetStockInventory,
  agentCreateStockReel,
  agentUpdateStockReel,
  agentDeleteStockReel,
  agentGetStockPresets,
  agentCreateStockPreset,
  agentDeleteStockPreset,
  agentGetProductionRuns,
  agentUpdateProductionRunStatus,
  agentDeleteProductionRun,
  agentGetWastageLogs,
  agentCreateWastageLog,
  agentGetMachines,
  agentCreateMachine,
  agentUpdateMachine,
  agentGetTrucksAndTransporters,
  agentCreateTruck,
  agentCreateLoadBatch,
  agentGetInvoices,
  agentUpdateInvoiceStatus,
  agentGetUsers,
  agentGetNotifications,
  agentGetDashboardSummary,
  agentGetDeckleDemand,
  agentRunDeckleOptimization,
  agentGetPendingDispatches,
} from "@/server/services/agent-tools-service";

export const maxDuration = 60;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  files?: Array<{
    name: string;
    type: string;
    base64?: string;
    text?: string;
  }>;
}

// -----------------------------------------------------------------------------
// OPENAI TOOLS DEFINITIONS (Complete ERP CRUD Suite)
// -----------------------------------------------------------------------------
const OPENAI_TOOLS = [
  // 1. Sales Orders
  {
    type: "function",
    function: {
      name: "getOrders",
      description: "Get or search sales orders with their client, reel sizes, weight, and status.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search query for orderNumber or client name" },
          status: { type: "string", enum: ["DRAFT", "CONFIRMED", "PLANNED", "IN_PRODUCTION", "PRODUCED", "DISPATCHED", "CANCELLED"] },
          limit: { type: "number", description: "Max number of orders to return" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createOrder",
      description: "Create a new Sales Order in the ERP with line items.",
      parameters: {
        type: "object",
        required: ["clientNameOrCode", "items"],
        properties: {
          clientNameOrCode: { type: "string", description: "Name of the client/customer" },
          orderNumber: { type: "string", description: "Optional custom order number" },
          priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
          deliveryDate: { type: "string", description: "Target delivery date (e.g. 2026-09-03 or ISO string)" },
          notes: { type: "string", description: "Special notes or dispatch instructions" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["widthInch", "gsm", "quantityKg"],
              properties: {
                widthInch: { type: "number", description: "Reel width in inches" },
                gsm: { type: "number", description: "GSM of paper" },
                quantityKg: { type: "number", description: "Quantity in kg" },
                ratePerKg: { type: "number", description: "Rate per kg in INR" },
                tolerancePercent: { type: "number", description: "Tolerance percent (default 5)" },
              },
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateOrder",
      description: "Update details of an existing Sales Order such as delivery date, priority, status, or notes.",
      parameters: {
        type: "object",
        required: ["orderNumberOrId"],
        properties: {
          orderNumberOrId: { type: "string", description: "Order number (e.g. SO-DL-01070) or Order ID" },
          deliveryDate: { type: "string", description: "New delivery date (e.g. 2026-09-03 or ISO string)" },
          priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
          status: { type: "string", enum: ["DRAFT", "CONFIRMED", "PLANNED", "IN_PRODUCTION", "PRODUCED", "DISPATCHED", "CANCELLED"] },
          notes: { type: "string", description: "Updated notes" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteOrder",
      description: "Delete an existing Sales Order and its line items.",
      parameters: {
        type: "object",
        required: ["orderNumberOrId"],
        properties: {
          orderNumberOrId: { type: "string", description: "Order number or ID to delete" },
        },
      },
    },
  },

  // 2. Clients
  {
    type: "function",
    function: {
      name: "getClients",
      description: "Search or list customer clients and buyers.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by client name, city, GSTIN, or code" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createClient",
      description: "Register a new client/customer in the ERP master directory.",
      parameters: {
        type: "object",
        required: ["name", "addressLine1", "city", "state", "pincode", "phone"],
        properties: {
          name: { type: "string" },
          code: { type: "string" },
          gstin: { type: "string" },
          addressLine1: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          pincode: { type: "string" },
          phone: { type: "string" },
          whatsappNumber: { type: "string" },
          contactPerson: { type: "string" },
          email: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateClient",
      description: "Update client details like phone, GSTIN, address, or email.",
      parameters: {
        type: "object",
        required: ["idOrCode"],
        properties: {
          idOrCode: { type: "string" },
          name: { type: "string" },
          gstin: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          phone: { type: "string" },
          whatsappNumber: { type: "string" },
          email: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteClient",
      description: "Deactivate a client/customer.",
      parameters: {
        type: "object",
        required: ["idOrCode"],
        properties: { idOrCode: { type: "string" } },
      },
    },
  },

  // 3. Inventory & Stock Reels
  {
    type: "function",
    function: {
      name: "getStockInventory",
      description: "Query warehouse finished reels inventory and allocated stock.",
      parameters: {
        type: "object",
        properties: {
          gsm: { type: "number", description: "Filter by GSM" },
          minWidth: { type: "number" },
          maxWidth: { type: "number" },
          status: { type: "string", enum: ["AVAILABLE", "ALLOCATED", "DISPATCHED"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createStockReel",
      description: "Add a new finished reel into warehouse stock inventory.",
      parameters: {
        type: "object",
        required: ["widthInch", "gsm", "quantityKg"],
        properties: {
          widthInch: { type: "number" },
          gsm: { type: "number" },
          quantityKg: { type: "number" },
          location: { type: "string", description: "Warehouse Bay (e.g. BAY-A)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateStockReel",
      description: "Update warehouse reel location, status, or weight.",
      parameters: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          location: { type: "string" },
          status: { type: "string", enum: ["AVAILABLE", "ALLOCATED", "DISPATCHED"] },
          quantityKg: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteStockReel",
      description: "Delete or write off a stock reel from warehouse.",
      parameters: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  },

  // 4. Stock Presets & Slitter Buffers
  {
    type: "function",
    function: {
      name: "getStockPresets",
      description: "Get stock buffer preset sizes used by deckle optimizer to fill slitter knives.",
      parameters: {
        type: "object",
        properties: { gsm: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createStockPreset",
      description: "Create a new standard stock buffer preset size for deckle optimization.",
      parameters: {
        type: "object",
        required: ["name", "widthInch", "gsm"],
        properties: {
          name: { type: "string" },
          widthInch: { type: "number" },
          gsm: { type: "number" },
          standardWeightKg: { type: "number" },
          defaultLocation: { type: "string" },
          shade: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteStockPreset",
      description: "Delete a stock buffer preset.",
      parameters: {
        type: "object",
        required: ["idOrCode"],
        properties: { idOrCode: { type: "string" } },
      },
    },
  },

  // 5. Production & Deckle Runs
  {
    type: "function",
    function: {
      name: "getProductionRuns",
      description: "Get recent production runs, trim waste percentages, and statuses.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PLANNED", "RELEASED", "RUNNING", "COMPLETED", "CANCELLED"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateProductionRunStatus",
      description: "Update production run status (e.g. start running, mark completed).",
      parameters: {
        type: "object",
        required: ["runNumberOrId", "status"],
        properties: {
          runNumberOrId: { type: "string" },
          status: { type: "string", enum: ["PLANNED", "RELEASED", "RUNNING", "COMPLETED", "CANCELLED"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteProductionRun",
      description: "Delete a production run.",
      parameters: {
        type: "object",
        required: ["runNumberOrId"],
        properties: { runNumberOrId: { type: "string" } },
      },
    },
  },

  // 6. Wastage Logs
  {
    type: "function",
    function: {
      name: "getWastageLogs",
      description: "Get trim and reject wastage logs with reasons and kg values.",
      parameters: {
        type: "object",
        properties: {
          wastageType: { type: "string", enum: ["TRIM", "REJECT", "OTHER"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createWastageLog",
      description: "Log physical trim or quality rejection scrap weight in kg.",
      parameters: {
        type: "object",
        required: ["wastageKg", "wastageType"],
        properties: {
          wastageKg: { type: "number" },
          wastageType: { type: "string", enum: ["TRIM", "REJECT", "OTHER"] },
          reason: { type: "string" },
          runNumberOrId: { type: "string" },
        },
      },
    },
  },

  // 7. Machines Master
  {
    type: "function",
    function: {
      name: "getMachines",
      description: "Get paper mill machine specifications, deckle bounds, and GSM limits.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "createMachine",
      description: "Register a new paper machine with its max deckle and trim bounds.",
      parameters: {
        type: "object",
        required: ["name", "code", "maxDeckleInch", "minDeckleInch", "minGsm", "maxGsm"],
        properties: {
          name: { type: "string" },
          code: { type: "string" },
          maxDeckleInch: { type: "number" },
          minDeckleInch: { type: "number" },
          minTrimInch: { type: "number" },
          maxTrimInch: { type: "number" },
          minGsm: { type: "number" },
          maxGsm: { type: "number" },
          speedMpm: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateMachine",
      description: "Update machine deckle limits or operational speed.",
      parameters: {
        type: "object",
        required: ["codeOrId"],
        properties: {
          codeOrId: { type: "string" },
          name: { type: "string" },
          maxDeckleInch: { type: "number" },
          minDeckleInch: { type: "number" },
          speedMpm: { type: "number" },
        },
      },
    },
  },

  // 8. Logistics: Trucks, Transporters, Load Batches
  {
    type: "function",
    function: {
      name: "getTrucksAndTransporters",
      description: "Get logistics fleet, truck capacities in MT, and transporters.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "createTruck",
      description: "Register a new transport vehicle with registration number and payload capacity in kg.",
      parameters: {
        type: "object",
        required: ["registrationNumber", "capacityKg"],
        properties: {
          registrationNumber: { type: "string" },
          capacityKg: { type: "number" },
          transporterNameOrId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createLoadBatch",
      description: "Create a dispatch load batch assignment for a truck.",
      parameters: {
        type: "object",
        properties: {
          truckRegistration: { type: "string" },
          driverName: { type: "string" },
          driverPhone: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },

  // 9. Invoices
  {
    type: "function",
    function: {
      name: "getInvoices",
      description: "Get recent GST tax invoices, amounts, and statuses.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["DRAFT", "ISSUED", "CANCELLED"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateInvoiceStatus",
      description: "Update GST tax invoice status (e.g. mark ISSUED or CANCELLED).",
      parameters: {
        type: "object",
        required: ["invoiceNumberOrId", "status"],
        properties: {
          invoiceNumberOrId: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "ISSUED", "CANCELLED"] },
        },
      },
    },
  },

  // 10. Users & Notifications
  {
    type: "function",
    function: {
      name: "getUsers",
      description: "List staff user accounts and roles.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getNotifications",
      description: "Get recent WhatsApp message notifications and dispatch alerts.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },

  // 11. Overview & planning
  {
    type: "function",
    function: {
      name: "getDashboardSummary",
      description: "Get headline mill KPIs: open orders, pending kg, orders due this week, overdue orders, production runs today, avg trim %, kg produced this week.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "getDeckleDemand",
      description: "List confirmed/planned order line items that are still awaiting deckle (cutting) planning.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "runDeckleOptimization",
      description: "Run the cutting-stock solver over all pending demand and return a proposed set of production runs with trim %. This is a plan only and is NOT committed — tell the user to commit it from the Deckle Planning screen.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", enum: ["MIN_TRIM", "MIN_PATTERNS", "BALANCED"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPendingDispatches",
      description: "List load batches that are planned/loading and ready for weighbridge and gate-pass dispatch.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function executeAgentTool(name: string, args: any) {
  switch (name) {
    // Orders
    case "getOrders":
      return await agentGetOrders(args);
    case "createOrder":
      return await agentCreateOrder(args);
    case "updateOrder":
      return await agentUpdateOrder(args);
    case "deleteOrder":
      return await agentDeleteOrder(args);

    // Clients
    case "getClients":
      return await agentGetClients(args);
    case "createClient":
      return await agentCreateClient(args);
    case "updateClient":
      return await agentUpdateClient(args);
    case "deleteClient":
      return await agentDeleteClient(args);

    // Inventory & Stock
    case "getStockInventory":
      return await agentGetStockInventory(args);
    case "createStockReel":
      return await agentCreateStockReel(args);
    case "updateStockReel":
      return await agentUpdateStockReel(args);
    case "deleteStockReel":
      return await agentDeleteStockReel(args);

    // Stock Presets
    case "getStockPresets":
      return await agentGetStockPresets(args);
    case "createStockPreset":
      return await agentCreateStockPreset(args);
    case "deleteStockPreset":
      return await agentDeleteStockPreset(args);

    // Production & Runs
    case "getProductionRuns":
      return await agentGetProductionRuns(args);
    case "updateProductionRunStatus":
      return await agentUpdateProductionRunStatus(args);
    case "deleteProductionRun":
      return await agentDeleteProductionRun(args);

    // Wastage
    case "getWastageLogs":
      return await agentGetWastageLogs(args);
    case "createWastageLog":
      return await agentCreateWastageLog(args);

    // Machines
    case "getMachines":
      return await agentGetMachines();
    case "createMachine":
      return await agentCreateMachine(args);
    case "updateMachine":
      return await agentUpdateMachine(args);

    // Logistics
    case "getTrucksAndTransporters":
      return await agentGetTrucksAndTransporters();
    case "createTruck":
      return await agentCreateTruck(args);
    case "createLoadBatch":
      return await agentCreateLoadBatch(args);

    // Invoices
    case "getInvoices":
      return await agentGetInvoices(args);
    case "updateInvoiceStatus":
      return await agentUpdateInvoiceStatus(args);

    // Users & Notifications
    case "getUsers":
      return await agentGetUsers();
    case "getNotifications":
      return await agentGetNotifications(args);

    // Cross-module overview & planning
    case "getDashboardSummary":
      return await agentGetDashboardSummary();
    case "getDeckleDemand":
      return await agentGetDeckleDemand();
    case "runDeckleOptimization":
      return await agentRunDeckleOptimization(args);
    case "getPendingDispatches":
      return await agentGetPendingDispatches();

    default:
      return { success: false, message: `Tool '${name}' not recognized.` };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const u = session?.user as any;
  if (!u) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (u.isPlatform || !u.tenantId) {
    return NextResponse.json(
      { error: "The AI assistant is only available for mill accounts." },
      { status: 403 }
    );
  }
  // This route is in the middleware public-list, so it carries no tenant headers.
  // Establish the tenant scope explicitly for the isolation layer.
  return runWithTenantContext(
    { tenantId: u.tenantId, isPlatform: false, userId: u.id },
    () => handleAgentPost(req, u)
  );
}


// ---------------------------------------------------------------------------
// PaperMill AI — OpenAI Responses API agentic loop
// ---------------------------------------------------------------------------

// gpt-4.1: strong at instruction-following, tool use, and reading PO/invoice
// PDFs + images, at roughly a third of gpt-4o's price. Swap to "gpt-4.1-mini"
// for ~5x cheaper still (small accuracy tradeoff on messy scans).
const OPENAI_MODEL = "gpt-4.1";
const MAX_AGENT_STEPS = 10;

// The Responses API wants FLAT function tools: { type, name, description, parameters }.
const RESPONSES_TOOLS = (OPENAI_TOOLS as any[]).map((t) => ({
  type: "function",
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters ?? { type: "object", properties: {} },
}));

function buildSystemPrompt(userName: string, userRole: string): string {
  return [
    "You are PaperMill AI, the operations assistant embedded in this kraft paper mill's ERP.",
    "",
    "You act on the mill's real data through tools. You can read and write across every module:",
    "sales orders, clients, warehouse stock & buffer presets, production runs & machines,",
    "deckle (cutting) planning, logistics (trucks, transporters, load batches, dispatch),",
    "GST invoices, wastage logs, users, and WhatsApp notifications.",
    "",
    "## Purchase orders / invoices attached as files",
    "When a PO, invoice, or order document (PDF or image) is attached:",
    "1. Read it end to end. Extract: the buyer/customer name, every reel line (width in inches,",
    "   GSM, quantity in kg, rate per kg if given), the delivery date, PO number, special instructions.",
    "2. Call getClients to match the buyer to an existing client. If none matches, tell the user and",
    "   create the client with createClient only if they asked you to proceed / 'just do it'.",
    "3. Call createOrder with the extracted client and line items (pass the PO number as orderNumber if",
    "   present; put the PO reference + instructions in notes).",
    "4. Confirm back exactly what you created: client, order number, each line, total kg.",
    "If a value is genuinely unreadable, say which one and ask; never guess quantities or GSM.",
    "",
    "## Working rules",
    "- Always use a tool for any real read or write. Never fabricate orders, stock, or numbers.",
    "- Chain tools freely to finish a task in one turn (e.g. look up client -> create order -> read it back).",
    "- Before a destructive action (delete / cancel), state what you will remove, then do it if the",
    "  user's instruction was explicit.",
    "- runDeckleOptimization only produces a plan — always tell the user to commit it from the Deckle Planning screen.",
    "- Keep replies short and factual. Use markdown tables for lists. Use the rupee sign and Indian digit grouping for money.",
    "",
    `Current user: ${userName} (${userRole}).`,
  ].join("\n");
}

type ResponsesOutput = {
  id: string;
  status?: string;
  output_text?: string;
  output?: Array<{
    type: string;
    role?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
};

async function callOpenAI(apiKey: string, requestBody: Record<string, unknown>) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 600)}`);
  }
  return JSON.parse(text) as ResponsesOutput;
}

async function handleAgentPost(req: NextRequest, sessionUser: any) {
  const userRole = sessionUser?.role || "STAFF";
  const userName = sessionUser?.name || "Staff Member";

  let body: {
    messages?: Message[];
    userMessage?: string;
    files?: Array<{ name: string; type: string; base64?: string; text?: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ reply: "Invalid request.", toolResults: [] }, { status: 400 });
  }

  const { messages = [], userMessage = "", files = [] } = body;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "PaperMill AI is not configured yet. An administrator needs to set the OPENAI_API_KEY secret on the deployment (npx wrangler secret put OPENAI_API_KEY).",
      toolResults: [],
    });
  }

  // Current user turn: files first (PDF / image), then the text.
  const userContent: any[] = [];
  for (const f of files || []) {
    if (f.base64 && f.type?.startsWith("image/")) {
      userContent.push({
        type: "input_image",
        image_url: `data:${f.type};base64,${f.base64}`,
      });
    } else if (
      f.base64 &&
      (f.type === "application/pdf" || f.name?.toLowerCase().endsWith(".pdf"))
    ) {
      userContent.push({
        type: "input_file",
        filename: f.name || "document.pdf",
        file_data: `data:application/pdf;base64,${f.base64}`,
      });
    } else if (f.text) {
      userContent.push({ type: "input_text", text: `[Attached file: ${f.name}]\n${f.text}` });
    }
  }
  userContent.push({
    type: "input_text",
    text: userMessage || "Please review the attached document and take the requested action.",
  });

  // Prior conversation (text only; earlier attachments are not re-sent).
  const history = (messages || [])
    .slice(0, -1)
    .slice(-8)
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content:
        (typeof m.content === "string" ? m.content : JSON.stringify(m.content)) || "(no text)",
    }));

  const system = buildSystemPrompt(userName, userRole);
  const toolResults: any[] = [];

  let input: any[] = [...history, { role: "user", content: userContent }];
  let previousResponseId: string | null = null;

  try {
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const resp = await callOpenAI(apiKey, {
        model: OPENAI_MODEL,
        instructions: system,
        tools: RESPONSES_TOOLS,
        tool_choice: "auto",
        parallel_tool_calls: true,
        input,
        ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      });
      previousResponseId = resp.id;

      const calls = (resp.output || []).filter((o) => o.type === "function_call");

      if (calls.length === 0) {
        const text =
          resp.output_text?.trim() ||
          (resp.output || [])
            .filter((o) => o.type === "message")
            .flatMap((m) => m.content || [])
            .filter((c) => c.type === "output_text")
            .map((c) => c.text || "")
            .join("")
            .trim();
        return NextResponse.json({ reply: text || "Done.", toolResults });
      }

      // Execute every requested tool; feed all outputs back next turn.
      input = [];
      for (const call of calls) {
        let args: any = {};
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = {};
        }
        let out: any;
        try {
          out = await executeAgentTool(call.name || "", args);
        } catch (e: any) {
          out = { success: false, message: "Tool crashed", error: e?.message || String(e) };
        }
        toolResults.push(out);
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(out).slice(0, 16000),
        });
      }
    }

    return NextResponse.json({
      reply:
        "I ran several steps but hit the step limit before finishing. Please narrow the request or ask me to continue.",
      toolResults,
    });
  } catch (error: any) {
    console.error("[PaperMill AI]", error);
    const msg = String(error?.message || "");
    return NextResponse.json({
      reply: msg.includes("OpenAI API 401")
        ? "The configured OPENAI_API_KEY is invalid."
        : `Something went wrong: ${msg || "unknown error"}`,
      toolResults,
    });
  }
}
