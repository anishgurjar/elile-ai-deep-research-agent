import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";

export interface Neo4jGraphConfig {
  url?: string;
  username?: string;
  password?: string;
  database?: string;
}

/**
 * Creates a Neo4jGraph instance configured from env vars (or explicit overrides).
 * Does NOT call refreshSchema() — that requires APOC and is not needed for ingestion.
 */
export function createNeo4jGraph(overrides: Neo4jGraphConfig = {}): Neo4jGraph {
  const url = overrides.url ?? process.env.ELILEAI_NEO4J_URI;
  const username = overrides.username ?? process.env.ELILEAI_NEO4J_USERNAME;
  const password = overrides.password ?? process.env.ELILEAI_NEO4J_PASSWORD;
  const database = overrides.database ?? process.env.ELILEAI_NEO4J_DATABASE ?? "neo4j";

  if (!url || !username || !password) {
    throw new Error(
      "Neo4j connection requires ELILEAI_NEO4J_URI, ELILEAI_NEO4J_USERNAME, and ELILEAI_NEO4J_PASSWORD",
    );
  }

  return new Neo4jGraph({ url, username, password, database });
}
