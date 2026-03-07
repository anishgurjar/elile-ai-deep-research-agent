# ELILEAI Monorepo

Unified repository for ELILEAI Assist services.

## Quick Start

### Prerequisites
- Node.js 20+
- Docker

### First-Time Setup

```bash
# 1. Create your .env from the template
cp .env.example .env
# 2. Fill in your API keys in .env

# 3. Run setup (installs deps, builds libraries, starts infra)
npm run setup
```

### Daily Development

```bash
npm run dev  # Starts all apps
```

---

## Manual Setup

```bash
npm run infra:up           # Start Docker containers
npm install                # Install Node.js dependencies
```

### Running Specific Apps

```bash
# Run all apps in dev mode
npm run dev

# Run a specific app (using Nx directly)
nx run langgraph:dev
nx run assistant-app:dev
```

### Common Commands

```bash
npm run dev                # Start all apps
npm run build              # Build all projects
npm run test               # Run all tests
npm run lint               # Lint all projects
npm run infra:up           # Start Docker containers
npm run infra:down         # Stop Docker containers
npm run graph              # View project dependency graph
```

---

## Structure

```
├── apps/
│   ├── langgraph/           # TypeScript backend (LangGraph)
│   └── assistant-app/       # Next.js frontend
├── packages/
│   ├── logger/              # Shared pino logger
│   └── shared-testing/      # Shared Vitest utilities
├── infrastructure/          # Docker Compose config
└── docs/                    # Architecture, plans
```
