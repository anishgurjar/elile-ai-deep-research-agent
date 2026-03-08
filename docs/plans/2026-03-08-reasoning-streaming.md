# Reasoning Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable GPT-5.2 reasoning **summaries** (with **low** reasoning effort) streaming end-to-end, and render the streamed reasoning summary in `apps/assistant-app`.

**Architecture:** Use OpenAI **Responses API** via `@langchain/openai` by opting into reasoning summaries (`reasoning.summary: "auto"`). Streamed reasoning summary deltas are mapped by `@langchain/openai` into `AIMessage.additional_kwargs.reasoning`, which `@assistant-ui/react-langgraph` can render as message parts (`type: "reasoning"`). Update the `assistant-app` runtime to **preserve** `additional_kwargs` and update the thread UI to **render** `Reasoning` parts.

**Tech Stack:** NX monorepo, TypeScript, LangChain (`langchain` + `@langchain/openai`), LangGraph (`@langchain/langgraph` + SDK), Next.js 15 (Edge runtime routes), `@assistant-ui/react` + `@assistant-ui/react-langgraph`, Vitest.

---

## Constraints / Non-goals

- **Do not** attempt to stream raw chain-of-thought. OpenAI does **not** expose it. We will stream **reasoning summaries** only.
- Keep changes minimal; reuse existing plumbing:
  - `@langchain/openai`’s built-in mapping of Responses streaming reasoning summary events → `additional_kwargs.reasoning`
  - `@assistant-ui/react-langgraph`’s built-in mapping of `additional_kwargs.reasoning` → message part `type:"reasoning"`
- Preserve existing tool-call streaming behavior.

---

## Background (what we’re wiring up)

### Backend source of reasoning stream

OpenAI reasoning models can return *reasoning summary* items when you opt in:

- Set `reasoning: { effort: "low", summary: "auto" }` (Responses API)
- Streaming produces events like `response.reasoning_summary_text.delta`
- `@langchain/openai` converts those into `AIMessage.additional_kwargs.reasoning` shaped like:

```ts
{
  type: "reasoning",
  summary: [{ type: "summary_text", text: "..." }]
}
```

### Frontend rendering of reasoning stream

`@assistant-ui/react-langgraph` renders reasoning when it sees:

- `LangChainMessage.additional_kwargs.reasoning` on an `ai` message, OR
- assistant content blocks like `{ type: "thinking" }` / `{ type: "reasoning" }`

Your repo already contains a `Reasoning` UI component at:

- `apps/assistant-app/components/assistant-ui/reasoning.tsx`

But it is not currently wired into `thread.tsx`, and the runtime currently drops `additional_kwargs` during streaming.

---

## Task 0: Worktree + baseline verification (required setup)

**Files:** none (setup only)

**Step 1: Create an isolated worktree**

Run (from repo root):

```bash
git status -sb
git worktree add "../deep-research-agent-reasoning-streaming" -b feature/reasoning-streaming
cd "../deep-research-agent-reasoning-streaming"
```

Expected:
- New worktree directory exists
- You are on branch `feature/reasoning-streaming`

**Step 2: Install deps**

```bash
npm install
```

Expected: completes successfully.

**Step 3: Run current tests (baseline)**

```bash
npx nx run assistant-app:test
npx nx run langgraph:test:unit
```

Expected: both pass (or if failures, capture them before proceeding).

**Step 4: Commit any lockfile drift (only if needed)**

If `package-lock.json` changes just from install, commit it as its own commit:

```bash
git add package-lock.json
git commit -m "chore: refresh lockfile"
```

---

## Task 1: Upgrade `assistant-ui` dependencies (frontend prerequisites)

**Files:**
- Modify: `apps/assistant-app/package.json`
- Modify: `package-lock.json`

**Why:** We want `@assistant-ui/react-langgraph`’s latest message-part conversion logic for reasoning and stable LangGraph integration.

**Step 1: Write failing check (optional but recommended)**

Create a small “dependency version guard” test so upgrades are intentional:

- Create: `apps/assistant-app/lib/__tests__/assistantUiVersions.test.ts`

```ts
import { describe, it, expect } from "vitest";

describe("assistant-ui versions", () => {
  it("uses assistant-ui versions that support reasoning parts", () => {
    // Keep this loose: only ensure we’re on a recent minor.
    // Update expectation when bumping versions.
    const react = require("@assistant-ui/react/package.json").version as string;
    const langgraph = require("@assistant-ui/react-langgraph/package.json")
      .version as string;
    expect(react).toMatch(/^0\./);
    expect(langgraph).toMatch(/^0\./);
  });
});
```

**Step 2: Run the test to ensure it fails (if you use strict expectations)**

```bash
npx nx run assistant-app:test --testFile=apps/assistant-app/lib/__tests__/assistantUiVersions.test.ts
```

Expected: may fail until versions are upgraded (if you add strict constraints).

**Step 3: Upgrade packages**

Run:

```bash
cd apps/assistant-app
npm install @assistant-ui/react@latest @assistant-ui/react-langgraph@latest @assistant-ui/react-markdown@latest
cd ../..
```

**Step 4: Re-run assistant-app tests**

```bash
npx nx run assistant-app:test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/assistant-app/package.json package-lock.json
git commit -m "chore(assistant-app): upgrade assistant-ui packages"
```

---

## Task 2: Backend — configure `gpt-5.2` as a reasoning model (low effort) with reasoning summaries enabled

**Files:**
- Modify: `apps/langgraph/src/agents/orchestrator/graph/graph.ts`
- Create: `apps/langgraph/src/agents/orchestrator/graph/graph.model.ts`
- Create: `apps/langgraph/src/agents/orchestrator/graph/graph.model.test.ts`

**Why:** We must opt into reasoning summaries so there’s something to stream and show.

OpenAI requirement (Responses API): `reasoning: { effort: "low", summary: "auto" }`.

**Step 1: Write the failing unit test (no network)**

Create: `apps/langgraph/src/agents/orchestrator/graph/graph.model.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { createOrchestratorModel } from "./graph.model";

describe("Orchestrator reasoning model config", () => {
  it("enables low-effort reasoning summaries", () => {
    const model = createOrchestratorModel();

    // Assert constructor fields (public on BaseChatOpenAI)
    expect((model as any).model).toBe("gpt-5.2");
    expect((model as any).streaming).toBe(true);

    // Verify invocation params include reasoning summary opt-in.
    // This guarantees @langchain/openai will use Responses API and emit reasoning summary deltas.
    const params = (model as any).invocationParams?.({}) ?? {};
    expect(params.reasoning).toBeDefined();
    expect(params.reasoning.effort).toBe("low");
    expect(params.reasoning.summary).toBe("auto");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx nx run langgraph:test:unit --testFile=apps/langgraph/src/agents/orchestrator/graph/graph.model.test.ts
```

Expected: FAIL (because `createOrchestratorModel` doesn’t exist yet).

**Step 3: Implement the model factory**

Create: `apps/langgraph/src/agents/orchestrator/graph/graph.model.ts`

```ts
import { ChatOpenAI } from "@langchain/openai";

export function createOrchestratorModel() {
  return new ChatOpenAI({
    model: "gpt-5.2",
    streaming: true,
    reasoning: {
      effort: "low",
      summary: "auto",
    },
  });
}
```

Notes:
- Including `reasoning.summary` forces `ChatOpenAI` to use the **Responses API** internally, which is required for reasoning summaries and their streaming deltas.
- We intentionally set `streaming: true` so `graph.stream` can propagate token + reasoning deltas.

**Step 4: Wire the orchestrator graph to use the factory**

Modify: `apps/langgraph/src/agents/orchestrator/graph/graph.ts`

Replace the inline `new ChatOpenAI(...)` with:

```ts
import { createOrchestratorModel } from "./graph.model";

// ...
model: createOrchestratorModel(),
```

**Step 5: Run unit tests**

```bash
npx nx run langgraph:test:unit
```

Expected: PASS.

**Step 6: Commit**

```bash
git add \
  apps/langgraph/src/agents/orchestrator/graph/graph.ts \
  apps/langgraph/src/agents/orchestrator/graph/graph.model.ts \
  apps/langgraph/src/agents/orchestrator/graph/graph.model.test.ts
git commit -m "feat(langgraph): enable low-effort reasoning summaries for orchestrator"
```

---

## Task 3: Frontend — preserve streamed `additional_kwargs.reasoning` in the runtime

**Files:**
- Modify: `apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts`
- Create: `apps/assistant-app/components/assistant-ui/use-elileai-runtime.merge.test.tsx` (or `.test.ts`)

**Why:** `@assistant-ui/react-langgraph` needs `additional_kwargs.reasoning` to render `type:"reasoning"` parts. The current runtime rebuilds messages and drops `additional_kwargs` entirely.

**Step 1: Add a pure helper and write a failing unit test**

Refactor goal: extract a pure function that merges an incoming streamed `ai` message update into the current in-memory message, while:
- preserving `additional_kwargs` (including `.reasoning`)
- preserving/merging `tool_calls` by ID (existing behavior)
- preserving `content` as provided by the backend (string or array of content blocks)

Create: `apps/assistant-app/components/assistant-ui/use-elileai-runtime.merge.test.ts`

```ts
import { describe, it, expect } from "vitest";

import {
  mergeStreamedAiMessage,
  type MinimalLangChainMessage,
} from "./use-elileai-runtime";

describe("mergeStreamedAiMessage", () => {
  it("preserves additional_kwargs.reasoning while merging tool_calls", () => {
    const prev: MinimalLangChainMessage = {
      type: "ai",
      id: "assistant-1",
      content: "",
      tool_calls: [{ id: "call_1", name: "t", args: { a: 1 } }],
      additional_kwargs: undefined,
    };

    const incoming: MinimalLangChainMessage = {
      type: "ai",
      id: "server-id",
      content: [{ type: "text_delta", text: "Hi" }],
      tool_calls: [{ id: "call_1", name: "t", args: { a: 2 } }],
      additional_kwargs: {
        reasoning: {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "Because..." }],
        },
      },
    };

    const merged = mergeStreamedAiMessage({
      previous: prev,
      incoming,
      forcedId: "assistant-1",
    });

    expect(merged.id).toBe("assistant-1");
    expect(merged.additional_kwargs?.reasoning).toBeDefined();
    expect(merged.tool_calls?.[0]?.args).toEqual({ a: 2 });
  });
});
```

Run:

```bash
npx nx run assistant-app:test --testFile=apps/assistant-app/components/assistant-ui/use-elileai-runtime.merge.test.ts
```

Expected: FAIL until `mergeStreamedAiMessage` exists/exported.

**Step 2: Implement the helper and integrate it into streaming**

Modify: `apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts`

Implementation notes:
- Define a narrow type for what we need from streamed messages:

```ts
export type MinimalLangChainMessage = {
  type: "ai";
  id?: string;
  content: unknown;
  tool_calls?: Array<Record<string, unknown>>;
  additional_kwargs?: Record<string, unknown>;
  status?: unknown;
};
```

- Implement:

```ts
export function mergeStreamedAiMessage({
  previous,
  incoming,
  forcedId,
}: {
  previous: MinimalLangChainMessage;
  incoming: MinimalLangChainMessage;
  forcedId: string;
}): MinimalLangChainMessage {
  const existingToolCalls = (previous.tool_calls ?? []) as Array<Record<string, unknown>>;
  const incomingToolCalls = (incoming.tool_calls ?? []) as Array<Record<string, unknown>>;

  const mergedToolCalls = [...existingToolCalls];
  for (const newTc of incomingToolCalls) {
    const id = newTc?.["id"];
    if (!id) continue;
    const idx = mergedToolCalls.findIndex((tc) => tc?.["id"] === id);
    if (idx >= 0) mergedToolCalls[idx] = newTc;
    else mergedToolCalls.push(newTc);
  }

  return {
    ...incoming,
    id: forcedId,
    tool_calls: mergedToolCalls,
  };
}
```

- In the SSE loop (inside `messages/partial` handler), instead of reconstructing:
  - keep `serialized` as the source of truth
  - preserve `serialized.additional_kwargs` and `serialized.content` as-is
  - only apply the “merge tool calls” logic as above

**Step 3: Run assistant-app tests**

```bash
npx nx run assistant-app:test
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts \
  apps/assistant-app/components/assistant-ui/use-elileai-runtime.merge.test.ts
git commit -m "fix(assistant-app): preserve streamed reasoning metadata"
```

---

## Task 4: Frontend — render Reasoning parts in the thread UI

**Files:**
- Modify: `apps/assistant-app/components/assistant-ui/thread.tsx`
- (Existing) `apps/assistant-app/components/assistant-ui/reasoning.tsx`

**Why:** Even if reasoning is present in messages, it won’t show until `MessagePrimitive.Parts` is told how to render `Reasoning` and `ReasoningGroup`.

**Step 1: Write a failing UI-level test (lightweight)**

Prefer a narrow test against the message conversion rather than a full DOM render:

- Create: `apps/assistant-app/components/assistant-ui/reasoning.render.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { convertLangChainMessages } from "@assistant-ui/react-langgraph";

describe("reasoning message parts", () => {
  it("produces a reasoning part when additional_kwargs.reasoning is present", () => {
    const converted = convertLangChainMessages({
      type: "ai",
      id: "m1",
      content: "",
      additional_kwargs: {
        reasoning: {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "Because..." }],
        },
      },
    } as any);

    const msg = Array.isArray(converted) ? converted[0] : converted;
    expect(msg?.role).toBe("assistant");
    expect(Array.isArray(msg?.content)).toBe(true);
    expect((msg!.content as any[]).some((p) => p.type === "reasoning")).toBe(true);
  });
});
```

Run:

```bash
npx nx run assistant-app:test --testFile=apps/assistant-app/components/assistant-ui/reasoning.render.test.ts
```

Expected: PASS (this validates conversion; rendering hookup is next).

**Step 2: Wire `Reasoning` + `ReasoningGroup` into `thread.tsx`**

Modify: `apps/assistant-app/components/assistant-ui/thread.tsx`

- Add import:

```ts
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
```

- Update the assistant `MessagePrimitive.Parts` mapping:

```tsx
<MessagePrimitive.Parts
  components={{
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: { Fallback: ToolFallback },
  }}
/>;
```

**Step 3: Run assistant-app tests**

```bash
npx nx run assistant-app:test
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/assistant-app/components/assistant-ui/thread.tsx \
  apps/assistant-app/components/assistant-ui/reasoning.render.test.ts
git commit -m "feat(assistant-app): render streamed reasoning summary"
```

---

## Task 5: End-to-end manual verification (local dev)

**Files:** none (runtime check)

**Step 1: Ensure required env is set**

- `apps/langgraph/.env` (or repo `.env`) should include:
  - `OPENAI_API_KEY=...`
- `apps/assistant-app/.env` should include:
  - `NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:2024` (or your configured port)
  - `NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=<uuid>`

**Step 2: Start infra + dev servers**

From repo root:

```bash
npm run infra:up
npm run dev
```

Expected:
- LangGraph API running (default `2024`)
- Next.js running (default `3000`)

**Step 3: Trigger a run that should produce reasoning summary**

In the UI, ask something that reliably triggers reasoning summary output, e.g.:
- “Given these constraints, propose a plan with tradeoffs…”

Expected in UI:
- A **“Reasoning”** collapsible appears above/near the assistant message
- It **streams** (shimmer) while generating
- It contains a **summary**, not raw chain-of-thought

**Step 4: Verify SSE contains `additional_kwargs.reasoning`**

Temporarily add a debug log (only locally) or use DevTools Network → EventStream:
- Look for `messages/partial` events
- Confirm the AI message JSON includes:
  - `additional_kwargs.reasoning.type === "reasoning"`
  - `additional_kwargs.reasoning.summary[0].type === "summary_text"`
  - `additional_kwargs.reasoning.summary[0].text` is non-empty

---

## Task 6: Regression protection (optional but recommended)

**Files:**
- Modify/Create tests only

**Goal:** Ensure future “stream refactors” don’t drop reasoning again.

**Step 1: Add a fixture SSE payload test**

Extend `apps/assistant-app/lib/__tests__/chatApi.test.ts` to include a `messages/partial` event whose data contains `additional_kwargs.reasoning`, and assert the runtime merge function preserves it.

**Step 2: Commit**

```bash
git add apps/assistant-app/lib/__tests__/chatApi.test.ts
git commit -m "test(assistant-app): protect reasoning stream handling"
```

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-03-08-reasoning-streaming.md`. Two execution options:

1. **Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration
2. **Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?

