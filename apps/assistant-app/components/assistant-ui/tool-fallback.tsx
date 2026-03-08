import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useMessage } from "@assistant-ui/react";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/components/assistant-ui/markdown-text";

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

function extractDocNames(calls: ToolCallPart[]): string[] {
  const slugs = new Set<string>();

  for (const call of calls) {
    let args = call.args;

    if (!args && call.argsText) {
      try {
        args = JSON.parse(call.argsText);
      } catch {}
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
  } catch {}
  return null;
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "\u2026";
}

function resultToString(result: unknown): string {
  if (typeof result === "string") return result;
  if (result == null) return "";
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function SubagentCallOutput({
  call,
  label,
}: {
  call: ToolCallPart;
  label?: string;
}) {
  const hasResult = call.result !== undefined && call.result !== null;
  const resultText = resultToString(call.result);
  const [outputOpen, setOutputOpen] = useState(true);

  const instructions =
    extractInstructions(call.argsText) ??
    (typeof call.args?.instructions === "string"
      ? call.args.instructions
      : null);

  return (
    <div>
      {label && (
        <div className="bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
          {label}
        </div>
      )}

      {instructions && (
        <div className="border-b border-dashed px-4 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Instructions
          </div>
          <p className="text-xs text-muted-foreground">
            {truncate(instructions, 300)}
          </p>
        </div>
      )}

      <div className="px-4 py-2">
        <button
          onClick={() => setOutputOpen(!outputOpen)}
          className="flex w-full items-center gap-1.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          {hasResult ? (
            <CheckIcon className="size-3 text-emerald-500" />
          ) : (
            <Loader2 className="size-3 animate-spin" />
          )}
          <span className="flex-grow text-left">
            {hasResult ? "Output" : "Researching\u2026"}
          </span>
          {outputOpen ? (
            <ChevronUpIcon className="size-3.5" />
          ) : (
            <ChevronDownIcon className="size-3.5" />
          )}
        </button>

        {outputOpen && (
          <div className="mt-2">
            {hasResult ? (
              <div className="aui-md max-w-none text-sm leading-7 break-words text-foreground">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {resultText}
                </Markdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm italic">Waiting for results...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SubagentToolCall({
  allCalls,
}: {
  allCalls: ToolCallPart[];
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const count = allCalls.length;

  const hasAnyResult = allCalls.some(
    (c) => c.result !== undefined && c.result !== null,
  );

  return (
    <div className="aui-tool-fallback-root mb-4 flex w-full flex-col rounded-lg border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        {hasAnyResult ? (
          <CheckIcon className="size-4 shrink-0 text-emerald-500" />
        ) : (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
        <span className="flex flex-grow items-center gap-2 font-medium text-sm">
          Research Agent
          {count > 1 && (
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
              {count}
            </span>
          )}
        </span>
        {isExpanded ? (
          <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t">
          {allCalls.map((call, idx) => (
            <div
              key={call.toolCallId}
              className={idx > 0 ? "border-t" : undefined}
            >
              <SubagentCallOutput
                call={call}
                label={count > 1 ? `Worker ${idx + 1} of ${count}` : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  toolCallId,
  argsText,
  result,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const content = useMessage((m) => m.content);

  const { isFirst, allCalls } = useMemo(() => {
    const toolCalls = (content as unknown as Array<{ type: string }>).filter(
      (part): part is ToolCallPart =>
        part.type === "tool-call" &&
        (part as ToolCallPart).toolName === toolName,
    );

    const firstCall = toolCalls[0];
    return {
      isFirst: firstCall?.toolCallId === toolCallId,
      allCalls: toolCalls,
    };
  }, [content, toolName, toolCallId]);

  const isSubagentTool = toolName === "research_agent";
  const isSearch =
    !isSubagentTool && toolName.toLowerCase().includes("search");

  const docNames = useMemo(() => {
    if (!isSearch) return [];
    return extractDocNames(allCalls);
  }, [isSearch, allCalls]);

  if (!isFirst) {
    return null;
  }

  const count = allCalls.length;

  if (isSubagentTool) {
    return <SubagentToolCall allCalls={allCalls} />;
  }

  const getFormattedName = (): string => {
    if (isSearch) {
      if (docNames.length > 0) {
        return `Searched ${docNames.join(", ")}`;
      }
      return "Searched Sources";
    }

    const baseName = toolName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (baseName.startsWith("Search ")) return "Searched " + baseName.slice(7);
    if (baseName.startsWith("Retrieve "))
      return "Retrieved " + baseName.slice(9);
    if (baseName.startsWith("Fetch ")) return "Fetched " + baseName.slice(6);
    if (baseName.startsWith("Get ")) return "Got " + baseName.slice(4);
    if (baseName.startsWith("Query ")) return "Queried " + baseName.slice(6);
    return baseName;
  };

  const formattedName = getFormattedName();

  return (
    <div className="aui-tool-fallback-root mb-4 flex w-full flex-col gap-3 rounded-lg border py-3">
      <div className="aui-tool-fallback-header flex items-center gap-2 px-4">
        <CheckIcon className="aui-tool-fallback-icon size-4" />
        <p className="aui-tool-fallback-title flex flex-grow items-center gap-2">
          {formattedName}
          {count > 1 && (
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
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
            allCalls.map((call, index) => (
              <div key={call.toolCallId} className="px-4">
                <p className="mb-1 text-xs text-muted-foreground">
                  Call {index + 1} of {count}
                </p>
                <div className="aui-tool-fallback-args-root">
                  {call.argsText
                    ? formatArgs(call.argsText)
                    : call.args
                      ? formatArgs(JSON.stringify(call.args))
                      : null}
                </div>
                {call.result !== undefined && (
                  <div className="aui-tool-fallback-result-root mt-2 border-t border-dashed pt-2">
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
                {index < count - 1 && <hr className="my-3 border-dashed" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
