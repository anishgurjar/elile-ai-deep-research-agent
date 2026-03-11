# Instant Thread Titles (Design)

**Goal:** Generate and persist a thread title immediately when the first user message is sent, without waiting for the agent response/stream to finish.

## Current behavior

- The UI triggers title generation only after the first run stream completes (`consumeStream` end), which couples “title appears” latency to the agent’s response latency.
- Title generation uses `POST /api/generate-title` (OpenAI) and then updates LangGraph thread metadata with `metadata.title`.
- `POST /api/generate-title` is currently unauthenticated.

## Desired behavior

- When the user sends the first message, the app should start title generation **immediately**, in parallel with the agent run.
- While generation is in progress, the UI should show the existing “generating title” loading state/spinner behavior.
- The title-generation endpoint must require authentication.
- The title prompt must be minimal and constrained to prevent unrelated boilerplate (e.g., training cutoff disclaimers).

## Proposed changes

### 1) Trigger title generation on first user send (parallel)

- In `apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts`, when handling `onNew` and `isFirstMessage` is true:
  - fire-and-forget `aui.threadListItem().generateTitle()` after the first message is appended locally (and before/while `sendMessage` begins streaming).
  - Do not block message sending on title generation.

### 2) Remove “after stream ends” trigger

- Delete the `aui.threadListItem().generateTitle()` call currently invoked after `consumeStream()` finishes for the first message to avoid:
  - redundant title generations
  - metadata write races

### 3) Protect `POST /api/generate-title`

- Add Clerk-based auth using the existing `requireAuth()` helper (`apps/assistant-app/app/api/_middleware/auth.ts`).
- On auth failure, return the `requireAuth()` response.

### 4) Tighten title prompt

- Keep the system instruction short and explicit:
  - return **only** the title
  - no punctuation/quotes
  - title case
  - max ~4–6 words (keep current 4-word target)

## Testing / validation

- Add/adjust tests to assert:
  - `POST /api/generate-title` returns 401 when unauthenticated
  - `generateTitle()` is triggered on first `onNew` (and not only after stream completion)
- Run `npx nx run assistant-app:test` (or targeted tests for affected routes) and ensure TypeScript builds/lints pass for changed files.

