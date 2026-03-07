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

### Connection Strings

- **Postgres:** `postgresql://elileai:elileai_dev@localhost:5432/elileai`

### Tear Down

```bash
docker compose down        # Stop containers
docker compose down -v     # Stop and remove volumes
```
