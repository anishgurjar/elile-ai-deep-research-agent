import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useMessage } from "@assistant-ui/react";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useSubagentPanel } from "@/components/assistant-ui/subagent-panel-context";

interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  argsText?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

function getDocNameFromSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Extract unique document names from tool call args
function extractDocNames(calls: ToolCallPart[]): string[] {
  const slugs = new Set<string>();

  for (const call of calls) {
    // Get slug from args
    let args = call.args;

    // If args is not available, try parsing argsText
    if (!args && call.argsText) {
      try {
        args = JSON.parse(call.argsText);
      } catch {
        // Skip if can't parse
      }
    }

    if (args?.slug && typeof args.slug === "string") {
      slugs.add(args.slug);
    }
  }

  return Array.from(slugs).map(getDocNameFromSlug);
}

const formatArgs = (argsText: string): React.ReactElement => {
  try {
    const args = JSON.parse(argsText);
    return (
      <ul className="list-none space-y-1">
        {Object.entries(args).map(([key, value]) => (
          <li key={key.toUpperCase()}>
            <span className="font-semibold">{key}:</span>{" "}
            <span className="text-muted-foreground">
              {typeof value === "string" ? `"${value}"` : JSON.stringify(value)}
            </span>
          </li>
        ))}
      </ul>
    );
  } catch {
    return <pre className="whitespace-pre-wrap">{argsText}</pre>;
  }
};

function extractInstructions(argsText?: string): string | null {
  if (!argsText) return null;
  try {
    const parsed = JSON.parse(argsText) as Record<string, unknown>;
    const instructions = parsed?.instructions;
    if (typeof instructions === "string" && instructions.trim().length > 0) {
      return instructions.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  toolCallId,
  argsText,
  result,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const content = useMessage((m) => m.content);
  const subagentPanel = useSubagentPanel();

  // Get all tool calls of the same type
  const { isFirst, allCalls } = useMemo(() => {
    const toolCalls = (content as unknown as Array<{ type: string }>).filter(
      (part): part is ToolCallPart => part.type === "tool-call" && (part as ToolCallPart).toolName === toolName
    );

    const firstCall = toolCalls[0];
    return {
      isFirst: firstCall?.toolCallId === toolCallId,
      allCalls: toolCalls,
    };
  }, [content, toolName, toolCallId]);

  const isSubagentTool = toolName === "research_agent";
  const isSearch = !isSubagentTool && toolName.toLowerCase().includes("search");

  // Extract document names from search tool call args
  const docNames = useMemo(() => {
    if (!isSearch) return [];
    return extractDocNames(allCalls);
  }, [isSearch, allCalls]);

  // Only render for the first tool call of this type
  if (!isFirst) {
    return null;
  }

  const count = allCalls.length;

  // Map tool names to user-friendly display names
  const getFormattedName = (): string => {
    if (isSearch) {
      if (docNames.length > 0) {
        return `Searched ${docNames.join(", ")}`;
      }
      return "Searched Sources";
    }

    // Generic formatting with past tense
    const baseName = toolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (baseName.startsWith("Search ")) return "Searched " + baseName.slice(7);
    if (baseName.startsWith("Retrieve ")) return "Retrieved " + baseName.slice(9);
    if (baseName.startsWith("Fetch ")) return "Fetched " + baseName.slice(6);
    if (baseName.startsWith("Get ")) return "Got " + baseName.slice(4);
    if (baseName.startsWith("Query ")) return "Queried " + baseName.slice(6);
    return baseName;
  };

  const formattedName = getFormattedName();

  if (isSubagentTool) {
    const previews = allCalls.map((c) => {
      const instr =
        extractInstructions(c.argsText) ??
        (typeof c.args?.instructions === "string" ? c.args.instructions : null);
      return {
        toolCallId: c.toolCallId,
        instructions: instr ?? "No instructions",
        preview: truncate(instr ?? "No instructions", 140),
      };
    });

    return (
      <div className="aui-tool-fallback-root mb-4 flex w-full flex-col gap-3 rounded-lg border py-3">
        <div className="aui-tool-fallback-header flex items-center gap-2 px-4">
          <CheckIcon className="aui-tool-fallback-icon size-4" />
          <p className="aui-tool-fallback-title flex-grow flex items-center gap-2">
            Triggered Subagent
            {count > 1 && (
              <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-semibold">
                {count}
              </span>
            )}
          </p>
          <Button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="bg-[var(--elileai-link)] hover:bg-[var(--elileai-link-hover)]"
          >
            {isCollapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
        </div>
        {!isCollapsed && (
          <div className="aui-tool-fallback-content flex flex-col gap-2 border-t pt-2">
            {previews.map((p, idx) => (
              <div key={p.toolCallId} className="px-4">
                {count > 1 ? (
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      Worker {idx + 1} of {count}
                    </div>
                    <Button
                      onClick={() => subagentPanel.openForToolCall(p.toolCallId)}
                      variant="ghost"
                      className="h-7 px-2"
                    >
                      <ExternalLinkIcon className="size-4" />
                      <span className="ml-1 text-xs">Open</span>
                    </Button>
                  </div>
                ) : (
                  <div className="mb-1 flex items-center justify-end">
                    <Button
                      onClick={() => subagentPanel.openForToolCall(p.toolCallId)}
                      variant="ghost"
                      className="h-7 px-2"
                    >
                      <ExternalLinkIcon className="size-4" />
                      <span className="ml-1 text-xs">Open</span>
                    </Button>
                  </div>
                )}
                <div className="text-xs font-semibold text-muted-foreground mb-1">
                  Instructions
                </div>
                <pre className="text-xs whitespace-pre-wrap">{p.preview}</pre>
                {idx < previews.length - 1 ? (
                  <hr className="my-3 border-dashed" />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="aui-tool-fallback-root mb-4 flex w-full flex-col gap-3 rounded-lg border py-3">
      <div className="aui-tool-fallback-header flex items-center gap-2 px-4">
        <CheckIcon className="aui-tool-fallback-icon size-4" />
        <p className="aui-tool-fallback-title flex-grow flex items-center gap-2">
          {formattedName}
          {count > 1 && (
            <span className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-xs font-semibold">
              {count}
            </span>
          )}
        </p>
        <Button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="bg-[var(--elileai-link)] hover:bg-[var(--elileai-link-hover)]"
        >
          {isCollapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </div>
      {!isCollapsed && (
        <div className="aui-tool-fallback-content flex flex-col gap-2 border-t pt-2">
          {count === 1 ? (
            // Single call - show simple view
            <>
              <div className="aui-tool-fallback-args-root px-4">
                {formatArgs(argsText)}
              </div>
              {result !== undefined && (
                <div className="aui-tool-fallback-result-root border-t border-dashed px-4 pt-2">
                  <p className="aui-tool-fallback-result-header font-semibold">
                    Result:
                  </p>
                  <pre className="aui-tool-fallback-result-content whitespace-pre-wrap">
                    {typeof result === "string"
                      ? result
                      : JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            // Multiple calls - show grouped view
            allCalls.map((call, index) => (
              <div key={call.toolCallId} className="px-4">
                <p className="text-xs text-muted-foreground mb-1">
                  Call {index + 1} of {count}
                </p>
                <div className="aui-tool-fallback-args-root">
                  {call.argsText ? formatArgs(call.argsText) : call.args ? formatArgs(JSON.stringify(call.args)) : null}
                </div>
                {call.result !== undefined && (
                  <div className="aui-tool-fallback-result-root border-t border-dashed pt-2 mt-2">
                    <p className="aui-tool-fallback-result-header font-semibold">
                      Result:
                    </p>
                    <pre className="aui-tool-fallback-result-content whitespace-pre-wrap">
                      {typeof call.result === "string"
                        ? call.result
                        : JSON.stringify(call.result, null, 2)}
                    </pre>
                  </div>
                )}
                {index < count - 1 && (
                  <hr className="my-3 border-dashed" />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
