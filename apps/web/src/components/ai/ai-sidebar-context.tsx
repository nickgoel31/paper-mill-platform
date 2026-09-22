"use client";

import * as React from "react";

interface AiSidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const AiSidebarContext = React.createContext<AiSidebarContextValue | null>(null);

export function AiSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <AiSidebarContext.Provider value={value}>{children}</AiSidebarContext.Provider>;
}

export function useAiSidebar() {
  const ctx = React.useContext(AiSidebarContext);
  if (!ctx) throw new Error("useAiSidebar must be used within AiSidebarProvider");
  return ctx;
}
