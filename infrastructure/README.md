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

### Tear Down

```bash
docker compose down        # Stop containers
docker compose down -v     # Stop and remove volumes
```
