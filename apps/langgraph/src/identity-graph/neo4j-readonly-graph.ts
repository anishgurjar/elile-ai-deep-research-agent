import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";

export interface Neo4jReadonlyGraphConfig {
  url?: string;
  username?: string;
  password?: string;
  database?: string;
}

/**
 * Creates a Neo4jGraph instance using **read-only** credentials.
 * Defense-in-depth: the DB user only has MATCH privileges, so even if
 * the LLM generates a mutating Cypher statement, Neo4j will reject it.
 */
export function createNeo4jReadonlyGraph(
  overrides: Neo4jReadonlyGraphConfig = {},
): Neo4jGraph {
  const url =
    overrides.url ??
    process.env.ELILEAI_NEO4J_READ_URI ??
    process.env.ELILEAI_NEO4J_URI;
  const username =
    overrides.username ?? process.env.ELILEAI_NEO4J_READ_USERNAME;
  const password =
    overrides.password ?? process.env.ELILEAI_NEO4J_READ_PASSWORD;
  const database =
    overrides.database ??
    process.env.ELILEAI_NEO4J_READ_DATABASE ??
    process.env.ELILEAI_NEO4J_DATABASE ??
    "neo4j";

  if (!url || !username || !password) {
    throw new Error(
      "Neo4j readonly connection requires ELILEAI_NEO4J_READ_URI, ELILEAI_NEO4J_READ_USERNAME, and ELILEAI_NEO4J_READ_PASSWORD",
    );
  }

  return new Neo4jGraph({ url, username, password, database });
}
