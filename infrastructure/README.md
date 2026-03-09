# Infrastructure

## Local Development

Start local services:

```bash
docker compose up -d
```

### Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5432 | Primary database |
| Neo4j (HTTP) | 7474 | Identity graph — browser UI |
| Neo4j (Bolt) | 7687 | Identity graph — driver protocol |

### Connection Strings

- **Postgres:** `postgresql://elileai:elileai_dev@localhost:5432/elileai`
- **Neo4j HTTP:** `http://localhost:7474`
- **Neo4j Bolt:** `bolt://localhost:7687` (user: `neo4j`, password: `neo4j_dev`)

### Neo4j Read-Only User

The `neo4j-init` service creates a read-only Neo4j role (`idgraph_readonly`) and user (`neo4j_read`) used by the `identity_graph_read` tool. This prevents the graph-reading tool from accidentally mutating data.

Run it after Neo4j is healthy:

```bash
docker compose run --rm neo4j-init
```

Or start everything together (init runs automatically after neo4j healthcheck):

```bash
docker compose up -d
```

The init script is idempotent — safe to re-run.

| Env Var | Default | Purpose |
|---------|---------|---------|
| `ELILEAI_NEO4J_READ_URI` | `bolt://localhost:7687` | Read-only connection URI |
| `ELILEAI_NEO4J_READ_USERNAME` | `neo4j_read` | Read-only user |
| `ELILEAI_NEO4J_READ_PASSWORD` | `neo4j_read_dev` | Read-only password |
| `ELILEAI_NEO4J_READ_DATABASE` | `neo4j` | Target database |

### Tear Down

```bash
docker compose down        # Stop containers
docker compose down -v     # Stop and remove volumes
```
