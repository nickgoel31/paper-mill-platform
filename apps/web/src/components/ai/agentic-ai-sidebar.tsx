"use client";

import * as React from "react";
import {
  Menu,
  X,
  CornerDownRight,
  ListFilter,
  SlidersHorizontal,
  ArrowUp,
  ChevronDown,
  Paperclip,
  Loader2,
  RotateCcw,
  Plus,
  FileText,
  PanelRight,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  AgentOrdersCard,
  AgentStockCard,
  AgentProductionRunsCard,
  AgentCardBoundary,
} from "@/components/ai/agent-data-cards";

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

// PaperMill AI mark — 4-pointed spark on the app's gradient
function PaperMillAiIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="papermill-ai-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a73e8" />
          <stop offset="45%" stopColor="#7c3aed" />
          <stop offset="85%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <path
        fill="url(#papermill-ai-gradient)"
        d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"
      />
    </svg>
  );
}

// ERP-only prompt suggestions
const PRIMARY_SUGGESTIONS = [
  {
    label: "Create a sales order from the attached PO",
    prompt:
      "Read the attached purchase order, match the buyer to a client, and create the sales order with every reel line. Show me exactly what you created.",
  },
  {
    label: "Give me today's mill summary",
    prompt:
      "Show me the dashboard summary: open orders, pending kg, orders due this week, overdue orders, and today's production.",
  },
  {
    label: "What's pending deckle planning right now?",
    prompt: "List all confirmed order lines still waiting for deckle planning, grouped by GSM.",
  },
];

const ALL_SUGGESTIONS = [
  ...PRIMARY_SUGGESTIONS,
  {
    label: "Run the deckle optimizer on all pending demand",
    prompt:
      "Run the cutting-stock optimizer over all pending demand and tell me the proposed runs and average trim %.",
  },
  {
    label: "Show orders for 140 GSM vs available stock reels",
    prompt:
      "Show confirmed/planned orders needing 140 GSM and compare against available reels in the warehouse.",
  },
  {
    label: "Which load batches are ready to dispatch?",
    prompt: "List load batches that are planned or loading and ready for weighbridge and gate pass.",
  },
  {
    label: "Change an order's delivery date or priority",
    prompt: "Update sales order SO-… — set its delivery date and priority. Ask me for the details.",
  },
  {
    label: "Add a new client and its first order",
    prompt: "Register a new client, then create a sales order for them. Ask me for the details.",
  },
];

const HEADLINE_ROTATIONS = [
  "Create an order from a customer PO",
  "Plan the deckle, cut the trim loss",
  "Query orders, stock and production",
  "Run every module by chat",
];

export function AgenticAiSidebar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [attachedFiles, setAttachedFiles] = React.useState<AttachedFile[]>([]);
  const [showAllSuggestions, setShowAllSuggestions] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [showToolOptions, setShowToolOptions] = React.useState(false);
  const [headlineIndex, setHeadlineIndex] = React.useState(0);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const chatBottomRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll chat to bottom when active
  React.useEffect(() => {
    if (isOpen && messages.length > 0) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  // Adjust textarea height dynamically
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Handle file uploads (Images, PDFs, Text)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
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
              // Raw bytes: PaperMill AI reads PDFs and images natively — no OCR placeholder.
              base64,
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
    }

    toast.success(`${files.length} file(s) attached to context.`);
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
    setShowAllSuggestions(false);

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
        content: data.reply || "Operation completed successfully.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        toolResults: data.toolResults,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error(err.message || "Failed to reach PaperMill AI");
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `❌ **Error**: ${err.message || "Could not reach AI backend. Please verify your connection."}`,
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

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard");
  };

  const currentSuggestions = showAllSuggestions ? ALL_SUGGESTIONS : PRIMARY_SUGGESTIONS;

  return (
    <>
      {/* ------------------------------------------------------------------- */}
      {/* 1. FLOATING LAUNCHER BUTTON (Bottom-Right Corner)            */}
      {/* ------------------------------------------------------------------- */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="group flex items-center gap-2.5 h-12 sm:h-13 px-5 rounded-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.12)] transition-all duration-200 cursor-pointer active:scale-95"
            aria-label="Open PaperMill AI"
          >
            <PaperMillAiIcon className="w-5 h-5 transition-transform group-hover:rotate-12 duration-300" />
            <span className="text-sm font-medium tracking-tight text-slate-900">Ask PaperMill AI</span>
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 2. BACKDROP OVERLAY (Mobile)                                        */}
      {/* ------------------------------------------------------------------- */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-40 transition-opacity md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 3. SIDEBAR DRAWER PANEL                               */}
      {/* ------------------------------------------------------------------- */}
      <aside
        className={`fixed top-0 right-0 h-full bg-white z-50 border-l border-slate-200/90 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out font-sans select-text ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        } ${isExpanded ? "w-full md:w-[680px]" : "w-full sm:w-[420px] md:w-[440px]"}`}
      >
        {/* TOP BAR */}
        <div className="h-14 px-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          {/* Left: menu + title */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700 hover:text-slate-900 transition-colors"
                title="PaperMill AI menu"
                aria-label="Menu"
              >
                <Menu className="h-5 w-5 stroke-[2]" />
              </button>

              {/* Dropdown Menu */}
              {showMenu && (
                <div className="absolute left-0 top-10 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 font-medium text-left"
                  >
                    <Plus className="w-4 h-4 text-slate-500" />
                    <span>New chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      setAttachedFiles([]);
                      setShowMenu(false);
                      toast.success("Conversation cleared.");
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 font-medium text-left"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-500" />
                    <span>Reset conversation</span>
                  </button>
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-slate-700 hover:bg-slate-50 font-medium text-left"
                  >
                    <Paperclip className="w-4 h-4 text-slate-500" />
                    <span>Attach document / PO</span>
                  </button>
                </div>
              )}
            </div>

            <span className="text-[17px] font-normal text-slate-900 tracking-tight select-none flex items-center gap-2">
              <PaperMillAiIcon className="w-[18px] h-[18px]" />
              PaperMill AI
            </span>
          </div>

          {/* Right: Layout Switcher + Close Icon */}
          <div className="flex items-center gap-1 text-slate-600">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-9 px-2 rounded-lg hover:bg-slate-100 flex items-center gap-0.5 text-slate-600 hover:text-slate-900 transition-colors"
              title={isExpanded ? "Collapse width" : "Expand width"}
            >
              <PanelRight className="h-4 w-4 stroke-[1.8]" />
              <ChevronDown className="h-3 w-3 stroke-[2.2]" />
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="h-4 w-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* MAIN BODY VIEW */}
        <div className="flex-1 overflow-y-auto flex flex-col justify-between p-5 pb-3">
          {/* CASE A: INITIAL EMPTY STATE */}
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col justify-between">
              {/* Centered Large Gradient Headline */}
              <div className="my-auto py-12 px-2 text-center">
                <h1
                  onClick={() => setHeadlineIndex((prev) => (prev + 1) % HEADLINE_ROTATIONS.length)}
                  className="text-2xl sm:text-[27px] font-normal tracking-tight text-center bg-gradient-to-r from-[#1a73e8] via-[#7c3aed] to-[#a855f7] bg-clip-text text-transparent max-w-sm mx-auto select-none leading-snug cursor-pointer transition-all hover:opacity-90"
                  title="Click to cycle sample goals"
                >
                  {HEADLINE_ROTATIONS[headlineIndex]}
                </h1>
              </div>

              {/* Suggestions list (Anchored just above the prompt bar) */}
              <div className="space-y-3.5 mb-5 px-1">
                {currentSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(item.prompt)}
                    className="w-full flex items-start gap-3 text-left text-[13.5px] text-slate-700 hover:text-slate-950 transition-colors group cursor-pointer"
                  >
                    <CornerDownRight className="w-4 h-4 text-slate-500 group-hover:text-slate-900 shrink-0 mt-0.5 stroke-[2]" />
                    <span className="leading-snug">{item.label}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                  className="w-full flex items-center gap-3 text-left text-[13.5px] text-slate-700 hover:text-slate-950 transition-colors group font-medium cursor-pointer pt-1"
                >
                  <ListFilter className="w-4 h-4 text-slate-500 group-hover:text-slate-900 shrink-0 stroke-[2]" />
                  <span>{showAllSuggestions ? "Show fewer suggestions" : "View all suggestions"}</span>
                </button>
              </div>
            </div>
          ) : (
            /* CASE B: CONVERSATION STREAM (During Active Chatting) */
            <div className="flex-1 space-y-5 pb-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs text-slate-400 font-medium">Active Conversation</span>
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> New chat
                </button>
              </div>

              {messages.map((msg) => {
                const isAssistant = msg.role === "assistant";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-1.5 ${isAssistant ? "items-start" : "items-end"}`}
                  >
                    {isAssistant && (
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-600 mb-0.5">
                        <PaperMillAiIcon className="w-4 h-4" />
                        <span>PaperMill AI</span>
                      </div>
                    )}

                    <div
                      className={`text-[13px] leading-relaxed transition-all max-w-[92%] ${
                        isAssistant
                          ? "text-slate-800 w-full"
                          : "bg-slate-100 text-slate-900 px-4 py-2.5 rounded-[20px] rounded-br-sm"
                      }`}
                    >
                      {/* Attached files chips inside user message */}
                      {msg.files && msg.files.length > 0 && (
                        <div className="mb-2 pb-1.5 flex flex-wrap gap-1.5 border-b border-slate-200/60">
                          {msg.files.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-lg text-[11px] font-mono border border-slate-200 text-slate-700"
                            >
                              <FileText className="h-3 w-3 text-rose-500" />
                              <span className="truncate max-w-[120px]">{f.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Markdown / text content rendering */}
                      <div
                        className="prose prose-xs max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-[#1a73e8] prose-a:underline"
                        dangerouslySetInnerHTML={{
                          __html: formatMarkdownToHtml(msg.content),
                        }}
                      />

                      {/* Rich React UI Cards for ERP Objects */}
                      {msg.toolResults && msg.toolResults.length > 0 && (
                        <AgentCardBoundary>
                          <div className="pt-2 space-y-2">
                            {msg.toolResults.map((tr, tIdx) => {
                              if (!tr || !tr.success || !tr.data) return null;
                              const d = tr.data;

                              if (Array.isArray(d) && d.length > 0 && d[0]?.orderNumber && d[0]?.totalKg != null) {
                                return <AgentOrdersCard key={tIdx} orders={d} />;
                              }
                              if (!Array.isArray(d) && d.orderNumber && d.totalKg != null) {
                                return <AgentOrdersCard key={tIdx} orders={[d]} />;
                              }
                              if (Array.isArray(d) && d.length > 0 && d[0]?.widthInch != null && d[0]?.location) {
                                return <AgentStockCard key={tIdx} items={d} />;
                              }
                              if (Array.isArray(d) && d.length > 0 && d[0]?.runNumber && d[0]?.machine) {
                                return <AgentProductionRunsCard key={tIdx} runs={d} />;
                              }
                              return null;
                            })}
                          </div>
                        </AgentCardBoundary>
                      )}
                    </div>

                    {/* Actions Row */}
                    {isAssistant && (
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                        <span>{msg.timestamp}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="hover:text-slate-700 p-0.5 rounded transition-colors"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-center gap-2.5 text-xs text-slate-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#1a73e8]" />
                  <span>PaperMill AI is working…</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>
          )}

          {/* ATTACHED FILES CHIPS BAR (Above Prompt Box) */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 items-center">
              {attachedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full text-xs font-medium text-slate-700 border border-slate-200"
                >
                  <FileText className="h-3.5 w-3.5 text-slate-600" />
                  <span className="truncate max-w-[130px]">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachedFile(i)}
                    className="text-slate-400 hover:text-rose-600 ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* PROMPT BAR */}
          <div className="rounded-[26px] sm:rounded-[28px] border border-slate-300 focus-within:border-slate-400 focus-within:shadow-[0_2px_12px_rgba(0,0,0,0.06)] bg-white p-3.5 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask PaperMill AI to do anything in the ERP"
              className="w-full resize-none bg-transparent border-0 text-[14.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 leading-relaxed font-normal min-h-[32px] max-h-28"
            />

            <div className="flex items-center justify-between pt-2">
              {/* Left Toolbar Controls */}
              <div className="flex items-center gap-2">
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept=".pdf,image/*,.csv,.txt"
                  className="hidden"
                />

                {/* Attach PO / invoice / image */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  title="Attach a PO, invoice or image"
                >
                  <Paperclip className="w-3.5 h-3.5 text-slate-600" />
                  <span className="text-[11px] font-semibold">
                    {attachedFiles.length > 0 ? `${attachedFiles.length} file${attachedFiles.length > 1 ? "s" : ""}` : "Attach"}
                  </span>
                </button>

                {/* Sliders / Tune Tools Button */}
                <button
                  type="button"
                  onClick={() => setShowToolOptions(!showToolOptions)}
                  className="p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Model Controls & Parameters"
                >
                  <SlidersHorizontal className="w-4 h-4 stroke-[1.8]" />
                </button>

                {/* Optional Popover for AI Tools */}
                {showToolOptions && (
                  <div className="absolute left-6 bottom-20 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50 text-xs space-y-2 w-56">
                    <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                      Active Tools
                    </span>
                    <div className="space-y-1.5 text-slate-600">
                      {["Deckle cutting-stock solver", "ERP read & write (all modules)", "PDF / PO & invoice reader"].map((t) => (
                        <div key={t} className="flex items-center justify-between">
                          <span>{t}</span>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">ON</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Send Circular Button with Up Arrow */}
              <button
                type="button"
                disabled={isLoading || (!inputValue.trim() && attachedFiles.length === 0)}
                onClick={() => handleSendMessage()}
                className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
                  inputValue.trim() || attachedFiles.length > 0
                    ? "bg-slate-900 text-white hover:bg-black shadow-xs cursor-pointer active:scale-95"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
                aria-label="Send message"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                )}
              </button>
            </div>
          </div>

          {/* FOOTER DISCLAIMER */}
          <div className="text-center pt-2 pb-0.5 select-none">
            <span className="text-[11px] text-slate-400 font-normal">
              PaperMill AI acts on live ERP data — review its changes.
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

// Markdown formatter for conversational stream
function formatMarkdownToHtml(text: string): string {
  if (!text) return "";

  let lines = text.split("\n");
  let inTable = false;
  let tableHtml = "";
  let formattedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => c.match(/^:?-+:?$/))) {
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHtml = '<div class="my-2.5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs"><table class="w-full text-[11px] text-left divide-y divide-slate-100"><thead class="bg-slate-50 text-slate-600 font-bold"><tr>' +
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
    .replace(/^### (.+)$/gm, '<h3 class="font-bold text-xs uppercase tracking-wider text-slate-800 mt-2 mb-1">$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4 class="font-bold text-xs text-slate-900 mt-2 mb-0.5">$1</h4>')
    .replace(/`CONFIRMED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">CONFIRMED</span>')
    .replace(/`URGENT`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">URGENT</span>')
    .replace(/`PRODUCED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">PRODUCED</span>')
    .replace(/`PLANNED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">PLANNED</span>')
    .replace(/`DISPATCHED`/g, '<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">DISPATCHED</span>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-900 font-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-slate-600">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-slate-800 font-mono px-1.5 py-0.5 rounded text-[11px] font-bold">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="inline-flex items-center gap-0.5 text-[#1a73e8] hover:underline font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 text-[11px] my-0.5">$1 ↗</a>')
    .replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-slate-700 text-xs py-0.5">$1</li>')
    .replace(/\n\n/g, '<div class="h-1.5"></div>')
    .replace(/\n/g, '<br/>');

  return html;
}
