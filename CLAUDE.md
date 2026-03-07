# CLAUDE.md — ELILEAI Monorepo

## Quick Reference

```bash
npm run setup          # Full setup: install + build libs + infra up
npm run dev            # Start all dev servers
npm run test           # Run all tests
npm run infra:up       # Start Docker services
npm run infra:rebuild  # Rebuild Docker images
npm run infra:down     # Stop Docker services
```

## Repo Structure

This is an NX monorepo with TypeScript projects.

### Apps
| Project | Path | Language | What it does |
|---------|------|----------|-------------|
| `assistant-app` | `apps/assistant-app/` | TypeScript (Next.js 15) | Frontend UI with Clerk auth |
| `langgraph` | `apps/langgraph/` | TypeScript (LangGraph) | Agent backend — Elile AI investigation assistant |

### Shared Packages
| Project | Path | Language | What it does |
|---------|------|----------|-------------|
| `logger` | `packages/logger/` | TypeScript | Shared pino-based structured logger |
| `shared-testing` | `packages/shared-testing/` | TypeScript | Shared Vitest test utilities |

### Infrastructure
- `infrastructure/` — Docker Compose orchestration, Postgres init scripts
- `docker-compose.yml` — Local dev services (Postgres)

## Running Tests

### TypeScript (Vitest)

```bash
npx nx run langgraph:test          # All langgraph tests
npx nx run langgraph:test:unit     # Unit tests only
npx nx run langgraph:test:int      # Integration tests only
npx nx run assistant-app:test      # Assistant app tests
```

### Run everything

```bash
npx nx run-many --target=test
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your API keys. The app reads directly from `.env`.

| File | Purpose |
|------|---------|
| `.env` | Local development (gitignored) |
| `.env.example` | Template — copy to `.env` and configure |
| `.env.test` | Test overrides (dummy API keys, test DB) |
| `.env.ci` | CI environment (placeholder values) |

## NX Module Boundaries

Enforced by ESLint:
- **Libraries** (`type:lib`) → can only depend on other libraries
- **Apps** (`type:app`) → can only depend on libraries

## Docker Services (Local Dev)

| Service | Default Port | Override Env Var |
|---------|-------------|------------------|
| Postgres | 5432 | `ELILEAI_POSTGRES_PORT` |
| LangGraph API | 2024 | `ELILEAI_LANGGRAPH_PORT` |
| Next.js | 3000 | `PORT` |

## Key Conventions

- **Secrets**: Never commit `.env`. Use `.env.example` as the template with plain placeholder values.
- **Builds**: Shared packages must be built before apps can test. Run `npx nx run-many --target=build --projects=logger,shared-testing` if you get import errors.
- **NX caching**: `test`, `build`, and `lint` targets are cached. `dev` and `format` are not.
- **Default base branch**: `main`
