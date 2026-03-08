"use client";

import { useMemo } from "react";
import { useAuiState } from "@assistant-ui/react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubagentPanel } from "@/components/assistant-ui/subagent-panel-context";

type SubagentRun = {
  toolCallId: string;
  toolName: string;
  instructions?: string;
  status: "running" | "success" | "error";
  result?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSubagentRunsFromExtras(extras: unknown): SubagentRun[] {
  if (!isRecord(extras)) return [];
  const elileai = extras.elileai;
  if (!isRecord(elileai)) return [];
  const subagents = elileai.subagents;
  if (!isRecord(subagents)) return [];
  const runs = subagents.runs;
  return Array.isArray(runs) ? (runs as SubagentRun[]) : [];
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function SubagentsPanel() {
  const extras = useAuiState((s) => s.thread.extras);
  const panel = useSubagentPanel();

  const runs = useMemo(() => {
    return getSubagentRunsFromExtras(extras).filter(
      (r) => r.toolName === "research_agent",
    );
  }, [extras]);

  const selected = useMemo(() => {
    if (!panel.selectedToolCallId) return null;
    return runs.find((r) => r.toolCallId === panel.selectedToolCallId) ?? null;
  }, [panel.selectedToolCallId, runs]);

  if (!panel.isOpen) return null;

  return (
    <aside className="hidden lg:flex h-full w-[380px] shrink-0 flex-col border-l bg-background">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Subagents</div>
            <div className="text-xs text-muted-foreground">
              Research agent results
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={panel.close}
            aria-label="Close subagents panel"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {!panel.selectedToolCallId ? (
            <div className="text-sm text-muted-foreground">
              Click “Open” on a subagent tool call to view its output here.
            </div>
          ) : !selected ? (
            <div className="text-sm text-muted-foreground">
              Subagent run not found (it may have been cleared).
            </div>
          ) : (
            (() => {
              const instructions = selected.instructions ?? "";
              return (
                <div className="rounded-lg border bg-muted/30">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <div className="text-xs font-semibold">research_agent</div>
                    <div className="text-[10px] text-muted-foreground">
                      {selected.toolCallId.slice(0, 8)}
                    </div>
                  </div>
                  <div className="px-3 py-2 space-y-3">
                    {instructions ? (
                      <div>
                        <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                          Instructions
                        </div>
                        <pre className="text-xs whitespace-pre-wrap">
                          {instructions}
                        </pre>
                      </div>
                    ) : null}
                    <div>
                      <div className="text-[11px] font-semibold text-muted-foreground mb-1">
                        Result
                      </div>
                      <pre className="text-xs whitespace-pre-wrap">
                        {selected.status === "running"
                          ? "Running…"
                          : safeStringify(selected.result)}
                      </pre>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </aside>
  );
}

