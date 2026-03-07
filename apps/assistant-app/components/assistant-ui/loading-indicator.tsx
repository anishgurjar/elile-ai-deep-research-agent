"use client";

import { useMessage } from "@assistant-ui/react";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";

interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
}

/**
 * Generates a human-readable description of what the AI is doing based on tool calls
 */
function getLoadingMessage(toolCalls: ToolCallPart[]): string | null {
  if (toolCalls.length === 0) return null;

  // Check tool type and return appropriate message
  const toolName = toolCalls[0].toolName.toLowerCase();

  if (toolName.includes("search") || toolName.includes("retrieve") || toolName.includes("fetch")) {
    return "Searching Sources...";
  }

  // Generic fallback
  return "Working...";
}

export const LoadingIndicator = () => {
  const content = useMessage((m) => m.content);
  const status = useMessage((m) => m.status);

  const loadingMessage = useMemo(() => {
    // Only show when message is running
    if (status?.type !== "running") return null;

    const parts = content as unknown as Array<{ type: string }>;
    if (!parts || !Array.isArray(parts)) return null;

    // Check if there's any text content yet
    const hasText = parts.some(
      (part) =>
        part.type === "text" &&
        typeof (part as unknown as { text?: string }).text === "string" &&
        (part as unknown as { text: string }).text.trim().length > 0
    );

    // If there's already text, don't show loading indicator
    if (hasText) return null;

    // Get tool calls
    const toolCalls = parts.filter(
      (part): part is ToolCallPart => part.type === "tool-call"
    );

    return getLoadingMessage(toolCalls);
  }, [content, status]);

  if (!loadingMessage) return null;

  return (
    <div className="flex items-center gap-2 text-muted-foreground py-2">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm italic">{loadingMessage}</span>
    </div>
  );
};
