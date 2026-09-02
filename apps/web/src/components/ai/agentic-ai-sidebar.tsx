"use client";

import * as React from "react";
import {
  Sparkles,
  Bot,
  X,
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Loader2,
  Trash2,
  RotateCcw,
  Scissors,
  CheckCircle2,
  ArrowRight,
  Minimize2,
  Maximize2,
  ExternalLink,
  ChevronRight,
  Layers,
  Database,
  Truck,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AgentOrdersCard,
  AgentStockCard,
  AgentProductionRunsCard,
} from "@/components/ai/agent-data-cards";
import Link from "next/link";

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  base64?: string;
  text?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  files?: AttachedFile[];
  toolResults?: any[];
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "m-1",
    role: "assistant",
    content: `👋 **Welcome to PaperMill Agentic AI!**

I have direct access to your entire ERP system. I can read, create, edit, delete, and optimize records in real-time.

**What you can do:**
1. **📄 Upload Purchase Orders (PDF / Images)**: Drop or attach a customer PO to parse and create sales orders with 1 click.
2. **✂️ Deckle Optimizer**: Tell me to run cutting optimization across active machines.
3. **📦 Warehouse & Stock**: Ask me to add new warehouse reels or check inventory.
4. **📊 ERP CRUD**: Request creation or updates across clients, machines, trucks, stock presets, and invoices.`,
    timestamp: "Just now",
  },
];

const SUGGESTED_PROMPTS = [
  "Create sales order for Shittla Papers with 28\", 26\", 49\" 140 GSM",
  "Show warehouse inventory reels & allocated stock",
  "Check current machine deckles and production runs",
  "What is our active fleet and truck capacity?",
];

export function AgenticAiSidebar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [attachedFiles, setAttachedFiles] = React.useState<AttachedFile[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const chatBottomRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom
  React.useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  // Handle file uploads (Images, PDFs, Text)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
      const isImage = file.type.startsWith("image/");
      const isText = file.type.startsWith("text/") || file.name.endsWith(".csv") || file.name.endsWith(".txt");

      const reader = new FileReader();

      if (isText) {
        reader.onload = () => {
          setAttachedFiles((prev) => [
            ...prev,
            {
              name: file.name,
              type: file.type,
              size: file.size,
              text: reader.result as string,
            },
          ]);
        };
        reader.readAsText(file);
      } else {
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          setAttachedFiles((prev) => [
            ...prev,
            {
              name: file.name,
              type: file.type || (isPdf ? "application/pdf" : "image/png"),
              size: file.size,
              base64,
              text: isPdf ? `[PDF File: ${file.name}, size ${(file.size / 1024).toFixed(1)} KB]` : undefined,
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
    }

    toast.success(`${files.length} file(s) attached.`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachedFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputValue;
    if (!textToSend.trim() && attachedFiles.length === 0) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          userMessage: userMsg.content,
          files: userMsg.files,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `ast-${Date.now()}`,
        role: "assistant",
        content: data.reply || "Operation completed.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolResults: data.toolResults,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error(err.message || "Failed to communicate with Agentic AI");
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `❌ **Error**: ${err.message || "Could not reach backend AI engine. Please verify the server is running."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* ------------------------------------------------------------------- */}
      {/* 1. FLOATING AGENTIC AI BUTTON (Bottom-Right Corner)                 */}
      {/* ------------------------------------------------------------------- */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-3">
        {!isOpen && (
          <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-lg backdrop-blur border border-slate-700/50 animate-bounce">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>PaperMill AI Ready</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`relative group h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-xl ${
            isOpen
              ? "bg-slate-900 text-white rotate-90 scale-95"
              : "bg-gradient-to-tr from-sky-500 via-indigo-600 to-purple-600 text-white hover:scale-105 hover:shadow-indigo-500/30 ring-4 ring-white/80"
          }`}
          aria-label="Toggle Agentic AI Assistant"
        >
          {isOpen ? (
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          ) : (
            <>
              <Bot className="h-6 w-6 sm:h-7 sm:w-7 text-white animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-white items-center justify-center text-[9px] font-black text-white">
                  ✦
                </span>
              </span>
            </>
          )}
        </button>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 2. BACKDROP OVERLAY (Mobile)                                        */}
      {/* ------------------------------------------------------------------- */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40 transition-opacity md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 3. AGENTIC AI RIGHT SIDEBAR DRAWER                                  */}
      {/* ------------------------------------------------------------------- */}
      <aside
        className={`fixed top-0 right-0 h-full bg-white z-50 border-l border-slate-200/80 shadow-2xl flex flex-col transition-all duration-300 ease-in-out font-sans ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        } ${isExpanded ? "w-full md:w-[720px]" : "w-full sm:w-[460px]"}`}
      >
        {/* TOP HEADER */}
        <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm tracking-tight text-white">PaperMill Agentic AI</h2>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[10px] py-0 px-2 font-mono">
                  ACTIVE
                </Badge>
              </div>
              <p className="text-[11px] text-slate-300">Live Autonomous ERP Controller</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setMessages(INITIAL_MESSAGES)}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Reset Conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
              title="Close Sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* QUICK CAPABILITIES RIBBON */}
        <div className="px-4 py-2 bg-sky-50/80 border-b border-sky-100 flex items-center justify-between text-[11px] text-sky-900 font-medium">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-sky-600" />
            <span>Orders • Inventory • Deckle • Logistics • Invoices</span>
          </div>
          <span className="font-mono text-[10px] text-sky-600 bg-sky-100/80 px-2 py-0.5 rounded-full font-bold">
            All Modules
          </span>
        </div>

        {/* CHAT MESSAGE STREAM */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40">
          {messages.map((msg) => {
            const isAssistant = msg.role === "assistant";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isAssistant ? "items-start" : "items-start justify-end"}`}
              >
                {isAssistant && (
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div className={`space-y-2 max-w-[85%] ${isAssistant ? "" : "items-end"}`}>
                  <div
                    className={`p-3.5 rounded-2xl text-xs leading-relaxed transition-all shadow-sm ${
                      isAssistant
                        ? "bg-white text-slate-800 border border-slate-100 rounded-tl-sm"
                        : "bg-gradient-to-tr from-slate-900 to-slate-800 text-white rounded-tr-sm ml-auto"
                    }`}
                  >
                    {/* Attached files chips inside user message */}
                    {msg.files && msg.files.length > 0 && (
                      <div className="mb-2.5 pb-2 border-b border-white/20 flex flex-wrap gap-1.5">
                        {msg.files.map((f, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-lg text-[10px] font-mono"
                          >
                            {f.type.includes("pdf") ? (
                              <FileText className="h-3 w-3 text-red-300" />
                            ) : (
                              <ImageIcon className="h-3 w-3 text-sky-300" />
                            )}
                            <span className="truncate max-w-[120px]">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Markdown / text content rendering */}
                    <div
                      className="prose prose-xs max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-sky-600 prose-a:underline"
                      dangerouslySetInnerHTML={{
                        __html: formatMarkdownToHtml(msg.content),
                      }}
                    />

                    {/* Rich React UI Cards for ERP Objects */}
                    {msg.toolResults && msg.toolResults.length > 0 && (
                      <div className="pt-2 space-y-2">
                        {msg.toolResults.map((tr, tIdx) => {
                          if (!tr.success || !tr.data) return null;

                          // Orders Card
                          if (Array.isArray(tr.data) && tr.data.length > 0 && tr.data[0].orderNumber) {
                            return <AgentOrdersCard key={tIdx} orders={tr.data} />;
                          }
                          if (tr.data.orderNumber) {
                            return <AgentOrdersCard key={tIdx} orders={[tr.data]} />;
                          }

                          // Stock Reels Card
                          if (Array.isArray(tr.data) && tr.data.length > 0 && tr.data[0].widthInch && tr.data[0].location) {
                            return <AgentStockCard key={tIdx} items={tr.data} />;
                          }

                          // Production Runs Card
                          if (Array.isArray(tr.data) && tr.data.length > 0 && tr.data[0].runNumber) {
                            return <AgentProductionRunsCard key={tIdx} runs={tr.data} />;
                          }

                          return null;
                        })}
                      </div>
                    )}
                  </div>

                  <div
                    className={`text-[10px] font-mono text-slate-400 px-1 ${
                      isAssistant ? "text-left" : "text-right"
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {/* LOADING SPINNER */}
          {isLoading && (
            <div className="flex items-center gap-3 text-xs text-slate-500 bg-white p-3.5 rounded-2xl border border-slate-100 w-fit shadow-sm animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
              <span className="font-medium">PaperMill AI is executing ERP operations...</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* PROMPT SUGGESTIONS CHIPS (If only initial message) */}
        {messages.length <= 2 && !isLoading && (
          <div className="px-4 py-2.5 bg-white border-t border-slate-100 space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Suggested Actions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="text-[11px] text-left px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 border border-slate-200/60 text-slate-700 transition-all font-medium"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ATTACHED FILES PREVIEW BAR */}
        {attachedFiles.length > 0 && (
          <div className="px-4 py-2 bg-slate-100/80 border-t border-slate-200 flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Attached:</span>
            {attachedFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg text-xs font-mono border border-slate-200 shadow-sm"
              >
                {f.type.includes("pdf") ? (
                  <FileText className="h-3.5 w-3.5 text-rose-500" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 text-sky-500" />
                )}
                <span className="truncate max-w-[140px] text-slate-700 font-medium">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachedFile(i)}
                  className="text-slate-400 hover:text-rose-600 ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* INPUT COMPOSER AREA */}
        <div className="p-3.5 bg-white border-t border-slate-200 shrink-0">
          <div className="relative rounded-2xl border border-slate-200 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 bg-slate-50/50 p-2 transition-all">
            <textarea
              rows={2}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything or command ERP actions (e.g. 'Create order from PO', 'Query reels in stock')..."
              className="w-full resize-none bg-transparent border-0 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 leading-relaxed"
            />

            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <div className="flex items-center gap-1">
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept=".pdf,image/*,.csv,.txt"
                  className="hidden"
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-2.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 text-xs gap-1.5"
                  title="Upload PO (PDF / Image)"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium hidden sm:inline">Attach PO</span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setInputValue(
                      "Create Sales Order for SHITTLA PAPERS: 28\" 140GSM 392kg, 26\" 140GSM 364kg, 49\" 140GSM 686kg, 49\" 120GSM 1372kg"
                    );
                  }}
                  className="h-8 px-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 text-[11px] font-medium hidden sm:inline-flex"
                >
                  + Sample Order
                </Button>
              </div>

              <Button
                type="button"
                disabled={isLoading || (!inputValue.trim() && attachedFiles.length === 0)}
                onClick={() => handleSendMessage()}
                className="h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-md disabled:opacity-40 transition-all"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
          <div className="mt-1.5 text-center">
            <span className="text-[10px] text-slate-400">
              PaperMill AI has full database CRUD authority • Press <kbd className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">Enter</kbd> to execute
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

// Helper to format markdown boldly into basic HTML tags
function formatMarkdownToHtml(text: string): string {
  if (!text) return "";

  // Check if first line of table is header
  let lines = text.split("\n");
  let inTable = false;
  let tableHtml = "";
  let formattedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => c.match(/^:?-+:?$/))) {
        continue; // separator
      }
      if (!inTable) {
        inTable = true;
        tableHtml = '<div class="my-2.5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table class="w-full text-[11px] text-left divide-y divide-slate-100"><thead class="bg-slate-50 text-slate-600 font-bold"><tr>' +
          cells.map((c) => `<th class="px-2.5 py-1.5">${c}</th>`).join("") +
          "</tr></thead><tbody class=\"divide-y divide-slate-100\">";
      } else {
        tableHtml += '<tr class="hover:bg-slate-50/50">' +
          cells.map((c) => `<td class="px-2.5 py-1.5 font-medium">${c}</td>`).join("") +
          "</tr>";
      }
    } else {
      if (inTable) {
        inTable = false;
        tableHtml += "</tbody></table></div>";
        formattedLines.push(tableHtml);
        tableHtml = "";
      }
      formattedLines.push(line);
    }
  }

  if (inTable) {
    tableHtml += "</tbody></table></div>";
    formattedLines.push(tableHtml);
  }

  let html = formattedLines.join("\n")
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-xs uppercase tracking-wider text-slate-800 mt-2 mb-1 flex items-center gap-1.5">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 class="font-bold text-xs text-slate-900 mt-2 mb-0.5">$1</h4>')
    // Status badges
    .replace(/`CONFIRMED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200">CONFIRMED</span>')
    .replace(/`URGENT`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">URGENT</span>')
    .replace(/`PRODUCED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">PRODUCED</span>')
    .replace(/`PLANNED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">PLANNED</span>')
    .replace(/`DISPATCHED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">DISPATCHED</span>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900 font-bold">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em class="text-slate-600">$1</em>')
    // Code block
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-sky-700 font-mono px-1.5 py-0.5 rounded text-[11px] font-bold">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="inline-flex items-center gap-0.5 text-sky-600 hover:text-sky-700 hover:underline font-bold bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100 text-[11px] my-0.5">$1 ↗</a>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-slate-700 text-xs py-0.5">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '<div class="h-1.5"></div>')
    .replace(/\n/g, '<br/>');

  return html;
}
