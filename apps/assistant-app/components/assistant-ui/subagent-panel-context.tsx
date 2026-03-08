"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type SubagentPanelState = {
  isOpen: boolean;
  selectedToolCallId: string | null;
  openForToolCall: (toolCallId: string) => void;
  close: () => void;
};

const Ctx = createContext<SubagentPanelState | null>(null);

export function SubagentPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(
    null,
  );

  const value = useMemo<SubagentPanelState>(
    () => ({
      isOpen,
      selectedToolCallId,
      openForToolCall: (toolCallId: string) => {
        setSelectedToolCallId(toolCallId);
        setIsOpen(true);
      },
      close: () => setIsOpen(false),
    }),
    [isOpen, selectedToolCallId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSubagentPanel() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useSubagentPanel must be used within SubagentPanelProvider");
  }
  return ctx;
}

