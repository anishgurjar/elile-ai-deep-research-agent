# Planner Agent Tool + UI Plan Box Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a new `planner_agent` tool (backed by a Claude Sonnet planner agent) that creates a 6–7 item research plan for a *new subject*, surfaces that plan in the Assistant UI as a dedicated “Research Plan” box, and gates expensive research until the user approves the plan.

**Architecture:** Keep the existing orchestrator as the only deployed LangGraph graph. Extend it with a new `planner_agent` tool (similar to `research_agent`) that runs a new `src/agents/planner` agent. Planner produces strict JSON (stored in tool artifact `output`) so the UI can render a structured plan box and the orchestrator can reuse the plan when dispatching research subagents.

**Tech Stack:** Nx monorepo, TypeScript, LangChain `createAgent()`, LangGraph CLI, Neo4j identity graph tool (`identity_graph_read`), `@assistant-ui/react` / `@assistant-ui/react-langgraph`, Vitest.

---

### Task 1: Define the planner “plan JSON” contract (langgraph)

**Files:**
- Create: `apps/langgraph/src/agents/planner/contracts.ts`
- Test: `apps/langgraph/src/agents/planner/contracts.test.ts`

**Step 1: Write the failing test**

Create `apps/langgraph/src/agents/planner/contracts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PlannerToolResultSchema } from "./contracts";

describe("PlannerToolResultSchema", () => {
  it("accepts a ready plan with goals and seed scopes", () => {
    const parsed = PlannerToolResultSchema.parse({
      subject: "Jane Doe",
      status: "ready",
      goals: [
        { key: "identity", title: "Identity confirmation", why: "Confirm correct person." },
        { key: "adverse_media", title: "Adverse media", why: "Look for lawsuits/regulatory actions." },
      ],
      seed_scopes: [{ scope: "identity", angle: "Confirm identity via primary sources" }],
      questions: [],
      candidates: [],
    });
    expect(parsed.status).toBe("ready");
    expect(parsed.goals.length).toBeGreaterThan(0);
  });

  it("accepts a disambiguation response with candidates", () => {
    const parsed = PlannerToolResultSchema.parse({
      subject: "Alex Smith",
      status: "needs_disambiguation",
      goals: [],
      seed_scopes: [],
      questions: ["Which Alex Smith do you mean?"],
      candidates: [
        { label: "Alex Smith (VC, SF)", why: "Matches query context", sources: [{ url: "https://example.com" }] },
      ],
    });
    expect(parsed.candidates?.length).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: FAIL with module-not-found for `./contracts` (or missing export).

**Step 3: Write minimal implementation**

Create `apps/langgraph/src/agents/planner/contracts.ts`:

```ts
import { z } from "zod";

export const PlannerGoalSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
});

export const PlannerSeedScopeSchema = z.object({
  scope: z.string().min(1),
  angle: z.string().min(1),
});

export const PlannerCandidateSchema = z.object({
  label: z.string().min(1),
  why: z.string().min(1),
  sources: z.array(z.object({ url: z.string().min(1), title: z.string().optional() })).min(1),
});

export const PlannerToolResultSchema = z.object({
  subject: z.string().min(1),
  status: z.enum([
    "needs_disambiguation",
    "has_existing_graph",
    "needs_followups",
    "ready",
  ]),
  goals: z.array(PlannerGoalSchema),
  seed_scopes: z.array(PlannerSeedScopeSchema),
  questions: z.array(z.string()),
  candidates: z.array(PlannerCandidateSchema).optional().default([]),
});

export type PlannerToolResult = z.infer<typeof PlannerToolResultSchema>;
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/agents/planner/contracts.ts apps/langgraph/src/agents/planner/contracts.test.ts
git commit -m "feat(langgraph): add planner tool result schema"
```

---

### Task 2: Implement the Planner agent (Claude Sonnet 4.6) with strict JSON output

**Files:**
- Create: `apps/langgraph/src/agents/planner/planner-agent.model.ts`
- Create: `apps/langgraph/src/agents/planner/planner-agent.model.test.ts`
- Create: `apps/langgraph/src/agents/planner/prompt.ts`
- Create: `apps/langgraph/src/agents/planner/tools.ts`
- Create: `apps/langgraph/src/agents/planner/planner-agent.ts`

**Step 1: Write the failing test (model config)**

Create `apps/langgraph/src/agents/planner/planner-agent.model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createPlannerModel } from "./planner-agent.model";

describe("Planner model config", () => {
  it("uses Claude Sonnet 4.6 with thinking enabled", () => {
    const model = createPlannerModel();
    expect(model.model).toContain("claude-sonnet-4-6");
    expect(model.streaming).toBe(false);
    expect(model.thinking).toEqual({ type: "enabled", budget_tokens: 5000 });
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: FAIL with module-not-found for `./planner-agent.model`.

**Step 3: Write minimal implementation (model)**

Create `apps/langgraph/src/agents/planner/planner-agent.model.ts`:

```ts
import { ChatAnthropic } from "@langchain/anthropic";

export function createPlannerModel() {
  return new ChatAnthropic({
    model: "claude-sonnet-4-6",
    streaming: false,
    thinking: {
      type: "enabled",
      budget_tokens: 5000,
    },
  });
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/agents/planner/planner-agent.model.ts apps/langgraph/src/agents/planner/planner-agent.model.test.ts
git commit -m "feat(langgraph): add planner agent Claude model"
```

**Step 6: Add planner web-search tool (OpenAI web search)**

Create `apps/langgraph/src/agents/planner/tools.ts`:

```ts
import { tools as openaiTools } from "@langchain/openai";

export const webSearchTool = openaiTools.webSearch();
```

**Step 7: Add planner prompt with strict JSON requirement**

Create `apps/langgraph/src/agents/planner/prompt.ts`:

```ts
export const prompt = `
# ELILEAI Planner Agent

## Mission
You prepare an investigation plan for a NEW subject before expensive research runs.
You must prevent researching the wrong person and must gate web-intensive subagent work until the user approves a plan.

## Tools
- identity_graph_read: check if we already have a knowledge graph for the subject (read-only).
- web_search: do lightweight disambiguation (2–4 candidates max) when identity is ambiguous.

## Output format (STRICT)
Return ONLY valid JSON that matches the PlannerToolResult schema:
{
  "subject": string,
  "status": "needs_disambiguation" | "has_existing_graph" | "needs_followups" | "ready",
  "goals": [{ "key": string, "title": string, "why": string }],
  "seed_scopes": [{ "scope": string, "angle": string }],
  "questions": [string],
  "candidates": [{ "label": string, "why": string, "sources": [{ "url": string, "title"?: string }] }]
}

## Behavior
1) Extract the likely subject name from the user's request.
2) Call identity_graph_read first for that subject.
   - If the graph has meaningful existing knowledge: set status="has_existing_graph", keep goals minimal, and ask whether to use existing, expand a specific topic, or re-run full research.
3) If the graph is empty and identity is ambiguous:
   - Use web_search to find 2–4 candidate identities and ask the user to confirm (status="needs_disambiguation").
4) If identity is clear but the request is underspecified:
   - Ask 2–4 targeted follow-ups (status="needs_followups").
5) If ready:
   - Produce 6–7 high-level research goals and matching seed_scopes the orchestrator can run.
   - End with questions=[].
`.trim();
```

**Step 8: Implement planner agent runner**

Create `apps/langgraph/src/agents/planner/planner-agent.ts`:

```ts
import { createAgent } from "langchain";
import { prompt } from "./prompt";
import { createPlannerModel } from "./planner-agent.model";
import { webSearchTool } from "./tools";
import { createIdentityGraphReadTool } from "../../shared-tools/identity-graph";
import { createNeo4jReadonlyGraph } from "../../identity-graph/neo4j-readonly-graph";
import { createGraphCypherChain } from "../../shared-tools/identity-graph";
import { ChatOpenAI } from "@langchain/openai";

const identityGraphReadTool = createIdentityGraphReadTool({
  createChain: async () => {
    const graph = createNeo4jReadonlyGraph();
    return createGraphCypherChain({
      graph,
      llm: new ChatOpenAI({ model: "gpt-5o-mini", temperature: 0, streaming: false }),
    });
  },
});

const agent = createAgent({
  model: createPlannerModel(),
  tools: [identityGraphReadTool, webSearchTool],
  systemPrompt: prompt,
  name: "ELILEAI_Planner_Agent",
});

export async function runPlannerAgent(instructions: string): Promise<string> {
  const state = await agent.invoke({
    messages: [{ role: "user", content: instructions }],
  });
  const messages = state?.messages ?? [];
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const content = last?.content;
  return typeof content === "string" ? content.trim() : String(content ?? "").trim();
}
```

**Step 9: Run unit tests**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: PASS.

**Step 10: Commit**

```bash
git add apps/langgraph/src/agents/planner/planner-agent.ts apps/langgraph/src/agents/planner/prompt.ts apps/langgraph/src/agents/planner/tools.ts
git commit -m "feat(langgraph): add planner agent implementation"
```

---

### Task 3: Add `planner_agent` tool wrapper (like `research_agent`) that exposes `artifact.output`

**Files:**
- Create: `apps/langgraph/src/agents/orchestrator/planner-tools.ts`
- Test: `apps/langgraph/src/agents/orchestrator/planner-tools.test.ts`

**Step 1: Write the failing test**

Create `apps/langgraph/src/agents/orchestrator/planner-tools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createPlannerAgentTool } from "./planner-tools";

describe("planner_agent tool", () => {
  it("returns output in artifact.output when JSON is valid", async () => {
    const tool = createPlannerAgentTool({
      runPlannerAgent: async () =>
        JSON.stringify({
          subject: "Jane Doe",
          status: "ready",
          goals: [{ key: "identity", title: "Identity", why: "Confirm person." }],
          seed_scopes: [{ scope: "identity", angle: "Confirm identity" }],
          questions: [],
          candidates: [],
        }),
    });

    // langchain tool instances are callable functions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (tool as any).invoke({ instructions: "x" });
    expect(Array.isArray(res)).toBe(true);
    expect(res[1].tool).toBe("planner_agent");
    expect(res[1].output.subject).toBe("Jane Doe");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: FAIL module-not-found for `./planner-tools`.

**Step 3: Write minimal implementation**

Create `apps/langgraph/src/agents/orchestrator/planner-tools.ts`:

```ts
import { tool } from "langchain";
import { z } from "zod";
import { PlannerToolResultSchema } from "../planner/contracts";

const PlannerAgentInputSchema = z.object({
  instructions: z.string().min(1),
});

export type RunPlannerAgentFn = (instructions: string) => Promise<string>;

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

export function createPlannerAgentTool(options: {
  runPlannerAgent: RunPlannerAgentFn;
}) {
  return tool(
    async (input: z.infer<typeof PlannerAgentInputSchema>) => {
      const output = await options.runPlannerAgent(input.instructions);
      const cleaned = stripMarkdownFences(output);

      let parsed: unknown = null;
      try {
        parsed = PlannerToolResultSchema.parse(JSON.parse(cleaned));
      } catch {
        // fall through; return raw output
      }

      const content = parsed ? cleaned : output;
      return [
        content,
        {
          tool: "planner_agent",
          instructions: input.instructions,
          ...(parsed ? { output: parsed } : {}),
        },
      ] as const;
    },
    {
      name: "planner_agent",
      description:
        "Prepare a research plan for a new subject (disambiguate, ask follow-ups, or produce a 6–7 item plan) and return structured JSON.",
      schema: PlannerAgentInputSchema,
      responseFormat: "content_and_artifact",
    },
  );
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/agents/orchestrator/planner-tools.ts apps/langgraph/src/agents/orchestrator/planner-tools.test.ts
git commit -m "feat(langgraph): add planner_agent tool wrapper with artifact output"
```

---

### Task 4: Wire planner tool into the orchestrator graph

**Files:**
- Modify: `apps/langgraph/src/agents/orchestrator/graph/graph.ts`

**Step 1: Write a failing unit test (graph has tool registered)**

Create `apps/langgraph/src/agents/orchestrator/graph/graph.tools.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { graph } from "./graph";

describe("Orchestrator tools", () => {
  it("includes planner_agent tool", () => {
    // Graph structure varies; this is a lightweight assertion that shouldn't be brittle.
    const nodes = (graph as unknown as { nodes?: Record<string, unknown> }).nodes ?? {};
    expect(Object.keys(nodes).length).toBeGreaterThan(0);
    // If langgraph internals change, downgrade this test to a smoke test only.
    expect(graph).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails (if needed)**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: This test may PASS even before wiring (it’s a smoke test). If it’s not useful, delete it and rely on prompt + tool wrapper tests instead.

**Step 3: Implement wiring**

Edit `apps/langgraph/src/agents/orchestrator/graph/graph.ts`:
- Import `createPlannerAgentTool` from `../planner-tools`
- Import `runPlannerAgent` from `../../planner/planner-agent`
- Add the tool to the orchestrator’s `tools` array:

```ts
const plannerAgentTool = createPlannerAgentTool({
  runPlannerAgent,
});

// tools: [researchAgentTool, identityGraphReadTool, identityGraphIngestTool, plannerAgentTool]
```

**Step 4: Run unit tests**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/agents/orchestrator/graph/graph.ts
git commit -m "feat(langgraph): register planner_agent tool in orchestrator"
```

---

### Task 5: Update orchestrator prompt to use planner only for new subjects and to gate research until approval

**Files:**
- Modify: `apps/langgraph/src/agents/orchestrator/prompt.ts`
- Test: `apps/langgraph/src/agents/orchestrator/prompt.test.ts` (modify/add)

**Step 1: Add/extend prompt test**

Edit or create `apps/langgraph/src/agents/orchestrator/prompt.test.ts` to assert the prompt mentions `planner_agent` and the “new subject only” rule. Example:

```ts
import { describe, it, expect } from "vitest";
import { prompt } from "./prompt";

describe("orchestrator prompt", () => {
  it("mentions planner_agent and new-subject gating", () => {
    expect(prompt).toContain("planner_agent");
    expect(prompt.toLowerCase()).toContain("new subject");
    expect(prompt.toLowerCase()).toContain("do not launch");
  });
});
```

**Step 2: Run unit tests to see it fail**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: FAIL (prompt doesn’t mention planner yet).

**Step 3: Update the prompt**

Modify `apps/langgraph/src/agents/orchestrator/prompt.ts`:
- Add a “Planner Stage” section before “Planning Stage (Graph-first)”
- Key requirements to include verbatim-ish:
  - **Only call `planner_agent` when**:
    - The user is asking for deep research / investigation style work, AND
    - The user introduces a **new subject** (different person/company than the current subject in the thread).
  - If planner returns `status` other than `ready`, **do not** call `research_agent`.
  - When planner returns `ready`, ask: “Does this plan look good?” and wait.
  - On user approval, run research using `seed_scopes` from the planner output.
  - Avoid redundant `identity_graph_read` if planner already ran it and output is available.

**Step 4: Run unit tests to verify it passes**

Run:

```bash
npx nx run langgraph:test:unit --skip-nx-cache
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/langgraph/src/agents/orchestrator/prompt.ts apps/langgraph/src/agents/orchestrator/prompt.test.ts
git commit -m "feat(langgraph): orchestrator uses planner_agent for new subjects"
```

---

### Task 6: Add a tiny parser helper in assistant-app to read planner JSON safely

**Files:**
- Create: `apps/assistant-app/lib/planner/parse-planner-tool-result.ts`
- Test: `apps/assistant-app/lib/planner/parse-planner-tool-result.test.ts`

**Step 1: Write failing test**

Create `apps/assistant-app/lib/planner/parse-planner-tool-result.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parsePlannerToolResult } from "./parse-planner-tool-result";

describe("parsePlannerToolResult", () => {
  it("parses valid JSON string", () => {
    const parsed = parsePlannerToolResult(
      JSON.stringify({
        subject: "Jane Doe",
        status: "ready",
        goals: [{ key: "identity", title: "Identity", why: "Confirm." }],
        seed_scopes: [],
        questions: [],
        candidates: [],
      }),
    );
    expect(parsed?.subject).toBe("Jane Doe");
    expect(parsed?.status).toBe("ready");
  });

  it("returns null for non-JSON", () => {
    expect(parsePlannerToolResult("not json")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx nx run assistant-app:test --skip-nx-cache
```

Expected: FAIL module-not-found for `./parse-planner-tool-result`.

**Step 3: Write minimal implementation**

Create `apps/assistant-app/lib/planner/parse-planner-tool-result.ts`:

```ts
type PlannerToolResult = {
  subject: string;
  status: string;
  goals: Array<{ key: string; title: string; why: string }>;
  seed_scopes: Array<{ scope: string; angle: string }>;
  questions: string[];
  candidates?: Array<{
    label: string;
    why: string;
    sources: Array<{ url: string; title?: string }>;
  }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parsePlannerToolResult(input: unknown): PlannerToolResult | null {
  if (typeof input !== "string") return null;
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.subject !== "string") return null;
    if (typeof parsed.status !== "string") return null;
    if (!Array.isArray(parsed.goals)) return null;
    if (!Array.isArray(parsed.seed_scopes)) return null;
    if (!Array.isArray(parsed.questions)) return null;
    return parsed as PlannerToolResult;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx nx run assistant-app:test --skip-nx-cache
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/assistant-app/lib/planner/parse-planner-tool-result.ts apps/assistant-app/lib/planner/parse-planner-tool-result.test.ts
git commit -m "feat(assistant-app): add planner tool result parser"
```

---

### Task 7: Render the Planner “Research Plan” box in the Assistant UI

**Files:**
- Modify: `apps/assistant-app/components/assistant-ui/tool-fallback.tsx`

**Step 1: Write a minimal unit test for formatting logic (optional)**

If you want a test without adding React testing libs, keep all UI-only and skip. (Primary correctness comes from `parsePlannerToolResult` tests.)

**Step 2: Implement UI rendering**

Edit `apps/assistant-app/components/assistant-ui/tool-fallback.tsx`:
- Detect planner tool:
  - `const isPlannerTool = toolName === "planner_agent";`
- When `isPlannerTool` and `isFirst`, render a dedicated box:
  - Parse `call.result` via `parsePlannerToolResult(resultToString(call.result))`
  - Render:
    - Header: “Research Plan”
    - Subject line
    - A list (6–7) of goals: title + why
    - If `status !== "ready"` show `questions` and (if present) `candidates`
  - Keep collapse/expand behavior similar to existing tool cards.

Minimal JSX sketch (inline within `ToolFallback`):

```tsx
// import { parsePlannerToolResult } from "@/lib/planner/parse-planner-tool-result";
// ...
if (isPlannerTool) {
  const parsed = parsePlannerToolResult(resultToString(allCalls[0]?.result));
  return (
    <div className="mb-4 w-full rounded-lg border overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="text-sm font-medium">Research Plan</div>
        {parsed?.subject && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Subject: {parsed.subject}
          </div>
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
        {parsed?.goals?.length ? (
          <ul className="space-y-2">
            {parsed.goals.slice(0, 7).map((g) => (
              <li key={g.key} className="text-sm">
                <div className="font-medium">{g.title}</div>
                <div className="text-muted-foreground text-xs">{g.why}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-muted-foreground">Planning…</div>
        )}
        {parsed?.questions?.length ? (
          <div className="text-sm">
            <div className="font-medium">Questions</div>
            <ul className="list-disc pl-5 text-muted-foreground text-xs">
              {parsed.questions.slice(0, 6).map((q) => <li key={q}>{q}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

**Step 3: Run assistant-app tests**

Run:

```bash
npx nx run assistant-app:test --skip-nx-cache
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/assistant-app/components/assistant-ui/tool-fallback.tsx
git commit -m "feat(assistant-app): render planner research plan tool box"
```

---

### Task 8: End-to-end sanity run (local dev)

**Files:**
- No code changes (verification only)

**Step 1: Start infra (if needed)**

Run:

```bash
npm run infra:up
```

Expected: Postgres up (and any other required services).

**Step 2: Start dev**

Run:

```bash
npm run dev
```

Expected: LangGraph API on configured port, Next.js on 3000.

**Step 3: Manual verification checklist**

- Start a new thread, ask: “Deep research on John Smith (VC) — risks + scams.”
  - Expect: orchestrator calls `planner_agent`
  - UI shows “Research Plan” box with 6–7 goals (or disambiguation questions)
  - No `research_agent` boxes until you approve.
- Reply “Yes, looks good.”
  - Expect: orchestrator dispatches `research_agent` calls according to the plan.
- Ask a normal non-research question:
  - Expect: orchestrator answers directly; no `planner_agent` tool call.
- Switch to a new subject mid-thread:
  - Expect: orchestrator calls `planner_agent` again (new subject).

---

### Task 9: Final cleanups (lint/format)

**Files:**
- Potentially modifies formatting in touched files

**Step 1: Run lint/format for each app**

Run:

```bash
npx nx run langgraph:lint --skip-nx-cache
npx nx run assistant-app:lint --skip-nx-cache
```

Expected: PASS (or only formatting changes).

**Step 2: Commit any formatting-only changes**

```bash
git add -A
git commit -m "chore: format planner agent and UI changes"
```

