# Instant Thread Titles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Start generating and saving a thread title immediately when the first user message is sent, and secure the title-generation endpoint with Clerk auth.

**Architecture:** Trigger title generation from the assistant UI runtime on first message send (fire-and-forget) and remove the existing “after stream finishes” trigger. Protect `POST /api/generate-title` using the shared `requireAuth()` helper and tighten the prompt so the model returns only a short title.

**Tech Stack:** Next.js (App Router, Edge runtime), TypeScript, Clerk auth, OpenAI SDK, Vitest (assistant-app tests), Nx.

---

### Task 1: Secure `POST /api/generate-title`

**Files:**
- Modify: `apps/assistant-app/app/api/generate-title/route.ts`
- Reference: `apps/assistant-app/app/api/_middleware/auth.ts`
- Test: `apps/assistant-app/app/api/generate-title/__tests__/generate-title.endpoint-test.ts` (new)

**Step 1: Write the failing test**

- Create a new test that calls the route without auth and asserts \(401\).

**Step 2: Run test to verify it fails**

Run: `npx nx run assistant-app:test --testFile=apps/assistant-app/app/api/generate-title/__tests__/generate-title.endpoint-test.ts`  
Expected: FAIL (route returns 200/500 instead of 401).

**Step 3: Implement minimal auth**

- Add `requireAuth()` to the route and return its failure response when unauthenticated.

**Step 4: Run test to verify it passes**

Run: `npx nx run assistant-app:test --testFile=apps/assistant-app/app/api/generate-title/__tests__/generate-title.endpoint-test.ts`  
Expected: PASS.

---

### Task 2: Tighten the title prompt

**Files:**
- Modify: `apps/assistant-app/app/api/generate-title/route.ts`
- Test: reuse `apps/assistant-app/app/api/generate-title/__tests__/generate-title.endpoint-test.ts` (add a “prompt is constrained” snapshot/expectation if feasible without real OpenAI)

**Step 1: Add/adjust test coverage (non-network)**

- Assert the system prompt string is the tightened version (via module import / inline constant) if the code is structured to allow it; otherwise keep this as a lightweight code change without test.

**Step 2: Implement prompt tightening**

- Update system instruction to explicitly disallow extra text, disclaimers, quotes, punctuation; enforce short length.

**Step 3: Run assistant-app tests**

Run: `npx nx run assistant-app:test`  
Expected: PASS.

---

### Task 3: Trigger title generation immediately on first send

**Files:**
- Modify: `apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts`
- Reference: `apps/assistant-app/components/assistant-ui/elileai-adapter.ts`
- Test: `apps/assistant-app/components/assistant-ui/__tests__/use-elileai-runtime.title-generation.test.ts` (new, unit-level with mocks)

**Step 1: Write failing unit test**

- Mock `aui.threadListItem()` to expose `generateTitle`, `getState`, and `initialize` behaviors.
- Call `onNew()` with a first user message.
- Assert `generateTitle()` is invoked without waiting for streaming to complete.

**Step 2: Run test to verify it fails**

Run: `npx nx run assistant-app:test --testFile=apps/assistant-app/components/assistant-ui/__tests__/use-elileai-runtime.title-generation.test.ts`  
Expected: FAIL (no call to `generateTitle` until stream consumption ends).

**Step 3: Implement immediate trigger**

- In `onNew`, when `isFirstMessage` is true, fire-and-forget `aui.threadListItem().generateTitle()` after local message append.
- Ensure it does not throw / block send; swallow errors.

**Step 4: Run test to verify it passes**

Run: `npx nx run assistant-app:test --testFile=apps/assistant-app/components/assistant-ui/__tests__/use-elileai-runtime.title-generation.test.ts`  
Expected: PASS.

---

### Task 4: Remove “after stream ends” trigger to avoid double-generation

**Files:**
- Modify: `apps/assistant-app/components/assistant-ui/use-elileai-runtime.ts`
- Test: reuse `apps/assistant-app/components/assistant-ui/__tests__/use-elileai-runtime.title-generation.test.ts` (assert called once)

**Step 1: Update test expectation**

- Ensure `generateTitle()` is called exactly once for the first message.

**Step 2: Implement removal**

- Remove the `aui.threadListItem().generateTitle()` call at the end of `consumeStream` for `isFirstMessage`.

**Step 3: Run targeted tests**

Run: `npx nx run assistant-app:test --testFile=apps/assistant-app/components/assistant-ui/__tests__/use-elileai-runtime.title-generation.test.ts`  
Expected: PASS.

---

### Task 5: Full validation

**Files:**
- Modified in prior tasks

**Step 1: Run assistant-app test suite**

Run: `npx nx run assistant-app:test`  
Expected: PASS.

**Step 2: Run TypeScript build (if target exists)**

Run: `npx nx run assistant-app:build`  
Expected: PASS.

