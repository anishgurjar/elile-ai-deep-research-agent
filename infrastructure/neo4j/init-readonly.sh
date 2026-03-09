#!/usr/bin/env bash
set -euo pipefail

NEO4J_URI="${ELILEAI_NEO4J_URI:-bolt://neo4j:7687}"
NEO4J_ADMIN_USER="${ELILEAI_NEO4J_USERNAME:-neo4j}"
NEO4J_ADMIN_PASS="${ELILEAI_NEO4J_PASSWORD:-neo4j_dev}"

echo "Waiting for Neo4j to accept cypher-shell..."
until cypher-shell -a "$NEO4J_URI" -u "$NEO4J_ADMIN_USER" -p "$NEO4J_ADMIN_PASS" "RETURN 1" >/dev/null 2>&1; do
  sleep 2
done

echo "Applying readonly role/user..."
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_ADMIN_USER" -p "$NEO4J_ADMIN_PASS" -f /init/init-readonly.cypher
echo "Done."
