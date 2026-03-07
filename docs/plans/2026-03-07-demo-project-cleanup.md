# Demo Project Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip the LOAI production monorepo into a clean, public-demo-ready project named ELILEAI — removing 1Password integration, deleting rag-pipeline remnants, and renaming throughout.

**Architecture:** Direct file edits across shell scripts, project.json configs, docker-compose, env files, and branding strings. No new abstractions needed — it's pure cleanup + rename.

**Tech Stack:** NX monorepo, Next.js 15, LangGraph/LangSmith, Docker Compose, bash scripts.

---

## Context: What changed so far

The user has already deleted (via `git rm`) these packages:
- `packages/database/` — Alembic migrations + SQLAlchemy models
- `packages/celery/` — Celery config
- `pipelines/rag-pipeline/` — RAG pipeline
- `pipelines/question-ingestion/` — CSV processing pipeline

The remaining projects are:
- `apps/assistant-app/` — Next.js frontend
- `apps/langgraph/` — LangGraph agent backend
- `packages/schema/` — TypeSpec shared schema
- `packages/logger/` — Pino logger
- `packages/shared-testing/` — Vitest utilities
- `infrastructure/` — Docker Compose config

---

## Task 1: Remove 1Password from `dev.sh` and `infra-up.sh`

**Files:**
- Modify: `scripts/dev/run-dev.sh`
- Modify: `scripts/infra-up.sh`

**Step 1: Edit `scripts/dev/run-dev.sh`**

Replace the current content with a plain `.env` sourcing approach (no `op inject`):

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/cleanup-dev.sh"

trap cleanup_dev_servers SIGINT SIGTERM EXIT

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

npx nx run-many -t dev &
NX_PID=$!
wait $NX_PID
```

**Step 2: Edit `scripts/infra-up.sh`**

Remove the `op run` wrapper entirely. Replace the op-check block so `compose_cmd` is always just `docker compose`:

```bash
#!/bin/bash
set -euo pipefail

env_file="${ENV_FILE:-.env}"
export ENV_FILE="$env_file"
is_ci="${CI:-}"

compose_file_list="${COMPOSE_FILE:-docker-compose.yml}"
compose_cmd=(docker compose)
for f in $(printf "%s" "$compose_file_list" | tr ":" " "); do
  compose_cmd+=(-f "$f")
done

scale_args=""
has_celery_service=$("${compose_cmd[@]}" config --services 2>/dev/null | grep -q "celery-worker" && echo "true" || echo "false")
if [ "$is_ci" != "true" ] && [ "$has_celery_service" = "true" ]; then
  scale_args="--scale celery-worker=3"
fi

"${compose_cmd[@]}" up -d $scale_args
```

**Step 3: Verify by dry-run inspection (no infra needed)**

```bash
bash -n scripts/dev/run-dev.sh
bash -n scripts/infra-up.sh
```

Expected: no syntax errors printed.

**Step 4: Commit**

```bash
git add scripts/dev/run-dev.sh scripts/infra-up.sh
git commit -m "chore: remove 1Password from dev and infra startup scripts"
```

---

## Task 2: Remove `op run` from all `project.json` targets

**Files:**
- Modify: `apps/assistant-app/project.json`
- Modify: `apps/langgraph/project.json`

**Step 1: Edit `apps/assistant-app/project.json`**

Strip `op run --env-file=../../${ENV_FILE:-.env} --` from every command. Also remove the `"dependsOn": ["database:migrate"]` since database package is gone.

New content:

```json
{
  "name": "assistant-app",
  "projectType": "application",
  "tags": ["type:app", "lang:typescript"],
  "targets": {
    "dev": {
      "command": "next dev --turbopack --port ${PORT:-3000}",
      "options": { "cwd": "apps/assistant-app" }
    },
    "build": {
      "outputs": ["{projectRoot}/.next"]
    },
    "start": {
      "command": "next start",
      "options": { "cwd": "apps/assistant-app" }
    },
    "test": {
      "command": "vitest run",
      "options": { "cwd": "apps/assistant-app" },
      "outputs": [
        "{workspaceRoot}/reports/{projectRoot}/unittests",
        "{workspaceRoot}/coverage/{projectRoot}"
      ]
    },
    "test:ci": {
      "command": "vitest run",
      "options": { "cwd": "apps/assistant-app" },
      "outputs": [
        "{workspaceRoot}/reports/{projectRoot}/unittests",
        "{workspaceRoot}/coverage/{projectRoot}"
      ]
    },
    "test:unit": {
      "command": "vitest run --config vitest.unit.config.ts",
      "options": { "cwd": "apps/assistant-app" }
    },
    "test:int": {
      "command": "vitest run --config vitest.int.config.ts",
      "options": { "cwd": "apps/assistant-app" }
    },
    "lint": {
      "command": "eslint .",
      "options": { "cwd": "apps/assistant-app" }
    }
  },
  "implicitDependencies": ["schema"]
}
```

**Step 2: Edit `apps/langgraph/project.json`**

Strip `op run` wrappers and remove `"dependsOn": ["database:migrate"]`. Rename `LOAI_LANGGRAPH_PORT` to `ELILEAI_LANGGRAPH_PORT` in the dev command (consistent with rename in Task 6).

New content:

```json
{
  "name": "langsmith",
  "projectType": "application",
  "tags": ["type:app", "lang:typescript"],
  "targets": {
    "dev": {
      "command": "npx @langchain/langgraph-cli dev --port ${ELILEAI_LANGGRAPH_PORT:-2024}",
      "options": { "cwd": "apps/langgraph" }
    },
    "build": {
      "outputs": ["{projectRoot}/dist"]
    },
    "test": {
      "command": "vitest run",
      "options": { "cwd": "apps/langgraph" },
      "outputs": [
        "{workspaceRoot}/reports/{projectRoot}/unittests",
        "{workspaceRoot}/coverage/{projectRoot}"
      ]
    },
    "test:ci": {
      "command": "vitest run",
      "options": { "cwd": "apps/langgraph" },
      "outputs": [
        "{workspaceRoot}/reports/{projectRoot}/unittests",
        "{workspaceRoot}/coverage/{projectRoot}"
      ]
    },
    "cloud-experiments:ci": {
      "command": "vitest run --config vitest.cloud-experiments.config.ts",
      "options": { "cwd": "apps/langgraph" },
      "dependsOn": ["^build"]
    },
    "test:unit": {
      "command": "vitest run --config vitest.unit.config.ts",
      "options": { "cwd": "apps/langgraph" }
    },
    "test:int": {
      "command": "vitest run --config vitest.int.config.ts",
      "options": { "cwd": "apps/langgraph" }
    },
    "cloud-experiments": {
      "command": "vitest run --config vitest.cloud-experiments.config.ts",
      "options": { "cwd": "apps/langgraph" },
      "dependsOn": ["^build"]
    },
    "lint": {
      "command": "eslint .",
      "options": { "cwd": "apps/langgraph" }
    }
  },
  "implicitDependencies": ["schema"]
}
```

**Step 3: Commit**

```bash
git add apps/assistant-app/project.json apps/langgraph/project.json
git commit -m "chore: remove op run from project.json targets, drop database dependency"
```

---

## Task 3: Remove rag-pipeline remnants from `docker-compose.yml` and `package.json`

**Files:**
- Modify: `docker-compose.yml`
- Modify: `package.json`

**Step 1: Edit `docker-compose.yml`**

Remove the `celery-worker`, `flower`, `rabbitmq` services (they only existed for the rag-pipeline). Also remove the `rabbitmq_data` and `flower_data` volumes. Keep `postgres`, `minio`, `minio-init`, and `pinecone`.

Also remove `minio-init` bucket lines that reference `loai-knowledgebase-documents` (rag-pipeline specific); or keep generic bucket creation for the demo. Since the rag pipeline is gone, remove `minio-init` entirely too — it only set up RAG buckets.

New `docker-compose.yml`:

```yaml
name: ${COMPOSE_PROJECT_NAME:-elileai}

services:
  # ===================
  # Unified Postgres Database
  # ===================
  postgres:
    image: postgres:16
    container_name: ${COMPOSE_PROJECT_NAME:-elileai}-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: elileai
      POSTGRES_USER: elileai
      POSTGRES_PASSWORD: elileai_dev
    ports:
      - "${ELILEAI_POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infrastructure/postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U elileai"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ===================
  # Pinecone Local (Vector DB)
  # ===================
  pinecone:
    image: ghcr.io/pinecone-io/pinecone-local:latest
    container_name: ${COMPOSE_PROJECT_NAME:-elileai}-pinecone
    restart: unless-stopped
    environment:
      PORT: 5080
      PINECONE_HOST: localhost
    ports:
      - "${ELILEAI_PINECONE_PORT_RANGE_START:-5080}-${ELILEAI_PINECONE_PORT_RANGE_END:-5090}:5080-5090"
    platform: linux/amd64
    networks:
      default:
        aliases:
          - pinecone.local

volumes:
  postgres_data:
```

**Step 2: Edit `package.json`**

- Rename `"name"` to `"elileai-monorepo"`.
- Remove `"pipelines/*"` from workspaces.
- Remove `"rag-pipeline"` script.
- Remove `"migrate"` and `"migrate:create"` scripts (database package is gone).
- Update `"setup"` to drop `uv sync` and `database:migrate` since Python packages are gone.

New `package.json`:

```json
{
  "name": "elileai-monorepo",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "start": "npm run dev",
    "dev": "bash scripts/dev/run-dev.sh",
    "build": "nx run-many -t build",
    "test": "nx run-many -t test --skip-nx-cache",
    "lint": "nx run-many -t lint",
    "format": "nx run-many -t format",
    "infra:up": "nx run infrastructure:up",
    "infra:rebuild": "nx run infrastructure:rebuild",
    "infra:down": "nx run infrastructure:down",
    "infra:logs": "nx run infrastructure:logs",
    "graph": "nx graph",
    "setup": "npm install && nx run-many -t build --projects=tag:type:lib && nx run infrastructure:up",
    "reset": "nx run infrastructure:down && docker compose -f docker-compose.yml down -v",
    "deps:clean": "rm -rf node_modules && npm install",
    "cloud-experiments": "nx run langsmith:cloud-experiments"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.1",
    "@nx/eslint-plugin": "^22.4.1",
    "@nxlv/python": "^22.0.3",
    "@tsconfig/recommended": "^1.0.7",
    "@types/node": "^20",
    "@typescript-eslint/eslint-plugin": "^8.46.1",
    "@typescript-eslint/parser": "^8.46.1",
    "@typespec/compiler": "^0.60.0",
    "@typespec/json-schema": "^0.60.0",
    "eslint": "^9",
    "eslint-config-prettier": "^10.0.0",
    "eslint-plugin-import": "^2.27.5",
    "eslint-plugin-no-instanceof": "^1.0.1",
    "next": "^15.5.12",
    "nx": "^22.4.1",
    "prettier": "^3.3.3",
    "typescript": "^5"
  },
  "packageManager": "npm@10.2.0"
}
```

**Step 3: Commit**

```bash
git add docker-compose.yml package.json
git commit -m "chore: remove rag-pipeline docker services and clean up root package.json"
```

---

## Task 4: Update `.env.example`, `.env.test`, `.env.ci`

**Files:**
- Modify: `.env.example`
- Modify: `.env.test`
- Modify: `.env.ci`

**Step 1: Rewrite `.env.example`**

Remove all `op://` references (replace with plain `your-key-here` placeholders). Remove RAG pipeline section. Rename all `LOAI_*` vars to `ELILEAI_*`. Rename db user/pass from `loai`/`loai_dev` to `elileai`/`elileai_dev`. Remove `CELERY_*` and `CAPACITY_*` and S3/MinIO vars that were rag-only.

New `.env.example`:

```bash
# =============================================================================
# ELILEAI Monorepo Environment Variables
# =============================================================================
# Copy this file to .env and fill in the values.
# =============================================================================

APP_ENV=development
NODE_ENV=development

# -----------------------------------------------------------------------------
# Shared Infrastructure (from docker-compose.yml)
# -----------------------------------------------------------------------------

# Postgres Database
ELILEAI_SHARED_POSTGRES_HOST=localhost
ELILEAI_SHARED_POSTGRES_PORT=5432
ELILEAI_SHARED_POSTGRES_DB_NAME=elileai
ELILEAI_SHARED_POSTGRES_USER=elileai
ELILEAI_SHARED_POSTGRES_PASSWORD=elileai_dev
DATABASE_URL=postgresql://elileai:elileai_dev@localhost:5432/elileai

# Legacy DB vars (used by assistant-app)
DB_HOST=localhost
DB_PORT=5432
DB_USER=elileai
DB_PASSWORD=elileai_dev
DB_NAME=elileai

# Redis
REDIS_URL=redis://localhost:6379

# -----------------------------------------------------------------------------
# Port Overrides (for parallel dev stacks)
# -----------------------------------------------------------------------------
# COMPOSE_PROJECT_NAME=elileai
# ELILEAI_POSTGRES_PORT=5432
# ELILEAI_PINECONE_PORT_RANGE_START=5080
# ELILEAI_PINECONE_PORT_RANGE_END=5090
# ELILEAI_LANGGRAPH_PORT=2024

# -----------------------------------------------------------------------------
# AI Services
# -----------------------------------------------------------------------------

# OpenAI
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini

# Anthropic
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# LangSmith (observability)
LANGSMITH_API_KEY=your-langsmith-api-key-here

# Pinecone (vector DB) - leave PINECONE_HOST unset to use cloud
PINECONE_API_KEY=your-pinecone-api-key-here
PINECONE_HOST=http://localhost:5080

# -----------------------------------------------------------------------------
# Clerk Authentication
# -----------------------------------------------------------------------------

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZmFpdGhmdWwtbW9jY2FzaW4tNTkuY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=your-clerk-secret-key-here
CLERK_FRONTEND_API=your-clerk-frontend-api-here

# -----------------------------------------------------------------------------
# LangGraph (assistant-app)
# -----------------------------------------------------------------------------

NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:2024
NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=84c467ad-087a-510e-b8cb-b836547f53e3
NEXT_PUBLIC_CONVENTIONAL_AGENT_ID=84c467ad-087a-510e-b8cb-b836547f53e3
NEXT_PUBLIC_FHA_AGENT_ID=bdf4a171-1fcf-5765-86e3-6b79abf2b287

# -----------------------------------------------------------------------------
# App URLs
# -----------------------------------------------------------------------------

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Step 2: Rewrite `.env.test`**

Remove `op://` commented refs, RAG pipeline vars (`CELERY_*`, `INDEX_DESTINATION_CONFIG_FILEPATH`), Capacity vars. Rename db refs.

New `.env.test`:

```bash
APP_ENV=test

# Database
DATABASE_URL=postgresql://elileai:elileai_dev@localhost:5432/elileai_test
ELILEAI_SHARED_POSTGRES_DB_NAME=elileai_test

# Pinecone - dummy key to mimic CI
PINECONE_API_KEY=test-api-key
# PINECONE_HOST=http://localhost:5080  # Only for local dev; VCR tests replay cloud cassettes

# OpenAI - dummy key to mimic CI
OPENAI_API_KEY=test-api-key

# Clerk - uncomment both to re-record Polly cassettes with a real session JWT.
#CLERK_TEST_USER_ID=user_3ANAAG8nZ5n6qrJoAB2qmJVKFvj
#CLERK_SECRET_KEY=your-real-clerk-secret-here
```

**Step 3: Edit `.env.ci`**

Keep it mostly intact (CI placeholder values are fine). Update:
- `COMPOSE_PROJECT_NAME=loai` → `elileai`
- `LOAI_*` vars → `ELILEAI_*`
- DB creds: `loai`/`loai_dev`/`loai_test` → `elileai`/`elileai_dev`/`elileai_test`
- Remove RAG pipeline section (`CELERY_*`, `INDEX_DESTINATION_CONFIG_FILEPATH`)
- Remove MinIO/S3 vars that were rag-only (keep `PINECONE_*` since langsmith uses it)
- Remove `CAPACITY_API_KEY`, `X_CAPACITY_ID`

New `.env.ci`:

```bash
# =============================================================================
# ELILEAI Monorepo CI Environment Variables
# =============================================================================
# This file is committed to git and used by CI pipelines.
# Contains placeholder values - real secrets injected by CI vault at runtime.
# =============================================================================

APP_ENV=ci

# Docker Compose (CI): load base + CI override
COMPOSE_PROJECT_NAME=elileai
COMPOSE_FILE=docker-compose.yml:docker-compose.ci.yml

# -----------------------------------------------------------------------------
# Shared Infrastructure
# -----------------------------------------------------------------------------

# Postgres Database
ELILEAI_SHARED_POSTGRES_HOST=localhost
ELILEAI_SHARED_POSTGRES_PORT=5432
ELILEAI_SHARED_POSTGRES_DB_NAME=elileai_test
ELILEAI_SHARED_POSTGRES_USER=elileai
ELILEAI_SHARED_POSTGRES_PASSWORD=elileai_dev
DATABASE_URL=postgresql://elileai:elileai_dev@localhost:5432/elileai_test

# Legacy DB vars (used by assistant-app)
DB_HOST=localhost
DB_PORT=5432
DB_USER=elileai
DB_PASSWORD=elileai_dev
DB_NAME=elileai_test

# Redis
REDIS_URL=redis://localhost:6379

# -----------------------------------------------------------------------------
# AI Services (placeholders - real values from CI vault)
# -----------------------------------------------------------------------------

# OpenAI
OPENAI_API_KEY=ci-placeholder-openai-key
OPENAI_MODEL=gpt-4o-mini

# Anthropic
ANTHROPIC_API_KEY=ci-placeholder-anthropic-key

# LangSmith
LANGSMITH_API_KEY=ci-placeholder-langsmith-key

# Pinecone
PINECONE_API_KEY=ci-placeholder-pinecone-key
PINECONE_HOST=http://localhost:5080

# -----------------------------------------------------------------------------
# Clerk Authentication (placeholders for build)
# -----------------------------------------------------------------------------

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZmFpdGhmdWwtbW9jY2FzaW4tNTkuY2xlcmsuYWNjb3VudHMuZGV2JA
CLERK_SECRET_KEY=ci-placeholder-clerk-secret
CLERK_FRONTEND_API=placeholder.clerk.accounts.dev

# -----------------------------------------------------------------------------
# LangGraph (assistant-app)
# -----------------------------------------------------------------------------

NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:2024
NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=84c467ad-087a-510e-b8cb-b836547f53e3
NEXT_PUBLIC_CONVENTIONAL_AGENT_ID=84c467ad-087a-510e-b8cb-b836547f53e3
NEXT_PUBLIC_FHA_AGENT_ID=bdf4a171-1fcf-5765-86e3-6b79abf2b287

# -----------------------------------------------------------------------------
# App URLs
# -----------------------------------------------------------------------------

NEXT_PUBLIC_APP_URL=http://localhost:3001
NODE_ENV=production
```

**Step 4: Commit**

```bash
git add .env.example .env.test .env.ci
git commit -m "chore: remove 1Password refs from env files, rename LOAI vars to ELILEAI"
```

---

## Task 5: Update Postgres init scripts

**Files:**
- Modify: `infrastructure/postgres-init/*.sql` (likely creates the `loai_test` DB)

**Step 1: Find the init scripts**

```bash
ls infrastructure/postgres-init/
```

**Step 2: Update DB names and users**

In each SQL file, rename:
- `loai_test` → `elileai_test`
- `loai` (user) → `elileai`
- `loai_dev` → `elileai_dev`

**Step 3: Update `infrastructure/project.json`**

The `wait-for-db` command references the container name and `pg_isready -U loai`. Update to `elileai`:

```json
"command": "until docker exec ${COMPOSE_PROJECT_NAME:-elileai}-postgres pg_isready -U elileai; do sleep 1; done"
```

**Step 4: Commit**

```bash
git add infrastructure/
git commit -m "chore: rename database users from loai to elileai in infrastructure"
```

---

## Task 6: Rename `LOAI_*` port vars to `ELILEAI_*` in langsmith graph files

**Files:**
- Search and update: `apps/langgraph/src/**/*.ts` — anywhere `LOAI_LANGGRAPH_PORT` or other `LOAI_*` vars appear

**Step 1: Search for remaining LOAI references in langsmith app**

```bash
grep -r "LOAI" apps/langgraph/src/ --include="*.ts" -l
```

**Step 2: Rename occurrences**

For agent names like `LOAI_Underwriting_Agent`, `LOAI_FHA_Agent`, `LOAI_HR_Agent` in graph files — rename to `ELILEAI_Underwriting_Agent`, etc.

For any `LOAI_LANGGRAPH_PORT` env var reference, rename to `ELILEAI_LANGGRAPH_PORT`.

**Step 3: Check `langgraph.json` for `loai-*` graph names**

```bash
cat apps/langgraph/langgraph.json
```

Rename `loai-hr`, `loai-conventional`, `loai-fha` → `elileai-hr`, `elileai-conventional`, `elileai-fha`.

**Step 4: Commit**

```bash
git add apps/langgraph/
git commit -m "chore: rename LOAI agent names and graph IDs to ELILEAI in langsmith"
```

---

## Task 7: Rename branding in assistant-app frontend

**Files:**
- Modify: `apps/assistant-app/app/layout.tsx`
- Modify: `apps/assistant-app/components/auth/AuthPage.tsx`
- Modify: `apps/assistant-app/components/assistant-ui/threadlist-sidebar.tsx`

**Step 1: Search for all LOAI branding in assistant-app**

```bash
grep -r "LOAI" apps/assistant-app/ --include="*.tsx" --include="*.ts" -n
```

**Step 2: Replace "LOAI" with "ELILEAI" in each file found**

Common replacements:
- `title: "LOAI Assist"` → `title: "ELILEAI Assist"`
- `<span>LOAI</span>` → `<span>ELILEAI</span>`
- `"LOAI Assist"` → `"ELILEAI Assist"`

**Step 3: Check `apps/assistant-app/package.json` name field**

```bash
cat apps/assistant-app/package.json
```

If it says `"name": "@loai/assistant-app"`, rename to `"name": "@elileai/assistant-app"`.

**Step 4: Commit**

```bash
git add apps/assistant-app/
git commit -m "chore: rename LOAI branding to ELILEAI in assistant-app frontend"
```

---

## Task 8: Rename `@loai/*` package names throughout

**Files:**
- `packages/logger/package.json`
- `packages/schema/package.json`
- `packages/shared-testing/package.json`
- Any `tsconfig.base.json` path aliases
- Any `apps/*/package.json` that imports `@loai/*`

**Step 1: Find all `@loai/` references**

```bash
grep -r "@loai/" . --include="*.json" --include="*.ts" --include="*.tsx" -l
```

**Step 2: Rename package names**

In each package's `package.json`, change `"name": "@loai/..."` to `"name": "@elileai/..."`.

**Step 3: Update imports in apps**

In `apps/assistant-app` and `apps/langgraph`, replace any `import ... from "@loai/..."` with `@elileai/...`.

**Step 4: Update `tsconfig.base.json` path aliases**

Look for `"@loai/*"` path mappings and rename to `"@elileai/*"`.

**Step 5: Rename the testing package directory** (optional, can keep the folder name but just rename the npm package)

The folder `packages/shared-testing/` can stay as-is (git rename would be more disruptive), but update the `package.json` name.

**Step 6: Verify build**

```bash
npx nx run-many -t build --projects=schema,logger,shared-testing
```

Expected: all build successfully.

**Step 7: Commit**

```bash
git add packages/ apps/ tsconfig.base.json
git commit -m "chore: rename @loai/* npm packages to @elileai/*"
```

---

## Task 9: Update `CLAUDE.md` and `README.md`

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Step 1: Rewrite `CLAUDE.md`**

- Title: `# CLAUDE.md — ELILEAI Monorepo`
- Remove all references to 1Password / `op run` / `op inject` / `.env.resolved`
- Remove Python/pipeline sections (rag-pipeline, question-ingestion, database, celery)
- Remove worktrees section (scripts don't exist)
- Update port override var names from `LOAI_*` to `ELILEAI_*`
- Update env file table: remove `.env.resolved` row
- Key Conventions: remove 1Password mention, keep "never commit .env"
- Update the builds command to remove `database,shared-testing` (keep just what exists)

**Step 2: Rewrite `README.md`**

- Title: `# ELILEAI Monorepo`
- Remove 1Password CLI prerequisite
- Remove Python pipeline sections
- Remove `migrate` / `migrate:create` commands
- Remove `rag-pipeline` run command
- Update `.env.example` description (plain keys, no `op://`)

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md and README.md for ELILEAI demo project"
```

---

## Task 10: Final cleanup — remove stale `preinstall` hook and uv references

**Files:**
- `package.json` — `preinstall` hook runs `uv sync --all-packages` (no Python packages left)
- Any references to `.env.resolved` in `.gitignore`

**Step 1: Check `.gitignore` for `.env.resolved`**

```bash
cat .gitignore | grep -E "\.env"
```

Remove `.env.resolved` from `.gitignore` (it won't be generated anymore). Keep `.env` gitignored.

**Step 2: Remove `preinstall` hook from `package.json`**

The `preinstall` script runs `uv sync --all-packages`. Since all Python packages are deleted, remove it.

Also remove `"deps:clean"` script's `uv sync` portion.

**Step 3: Verify**

```bash
node -e "const p = require('./package.json'); console.log(p.scripts)"
```

**Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: remove uv/Python tooling from package.json, clean up .gitignore"
```

---

## Task 11: Smoke-test the full flow

**Step 1: Install deps (should be fast, no Python)**

```bash
npm install
```

Expected: installs without `uv sync`.

**Step 2: Build shared libs**

```bash
npx nx run-many -t build --projects=schema,logger,shared-testing
```

Expected: all pass.

**Step 3: Start infra**

```bash
npm run infra:up
```

Expected: postgres and pinecone containers start. No rabbitmq/celery/flower errors.

**Step 4: Run tests**

```bash
npm run test
```

Expected: all TypeScript tests pass.

**Step 5: Verify dev script has no `op` calls**

```bash
grep -r "op " scripts/ || echo "no op refs found"
```

Expected: "no op refs found" (or only unrelated matches).

---

## Summary of All Changes

| File | What changes |
|------|-------------|
| `scripts/dev/run-dev.sh` | Remove `op inject` block; source `.env` directly |
| `scripts/infra-up.sh` | Remove `op run` wrapper |
| `apps/assistant-app/project.json` | Strip `op run`, remove database dep |
| `apps/langgraph/project.json` | Strip `op run`, rename `LOAI_LANGGRAPH_PORT`, remove database dep |
| `docker-compose.yml` | Remove celery-worker, flower, rabbitmq; rename `loai` → `elileai` |
| `package.json` | Rename to `elileai-monorepo`, remove rag/migrate scripts, remove `preinstall` |
| `.env.example` | Replace `op://` with plain placeholders, rename `LOAI_*` → `ELILEAI_*` |
| `.env.test` | Remove `op://` comments, remove rag vars |
| `.env.ci` | Rename `LOAI_*` → `ELILEAI_*`, remove rag vars |
| `infrastructure/postgres-init/*.sql` | Rename db/user from loai to elileai |
| `infrastructure/project.json` | Update container name and pg user |
| `apps/langgraph/src/**` | Rename `LOAI_*` agent names to `ELILEAI_*` |
| `apps/langgraph/langgraph.json` | Rename graph IDs |
| `apps/assistant-app/**` | Rename branding strings |
| `apps/*/package.json` | Rename `@loai/*` deps |
| `packages/*/package.json` | Rename package names |
| `tsconfig.base.json` | Rename path aliases |
| `CLAUDE.md` | Full rewrite for ELILEAI demo |
| `README.md` | Full rewrite for ELILEAI demo |
| `.gitignore` | Remove `.env.resolved` |
