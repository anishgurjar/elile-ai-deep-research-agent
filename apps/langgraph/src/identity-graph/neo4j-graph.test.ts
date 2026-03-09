import { describe, expect, test, beforeEach, vi } from "vitest";

describe("createNeo4jGraph", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ELILEAI_NEO4J_URI;
    delete process.env.ELILEAI_NEO4J_USERNAME;
    delete process.env.ELILEAI_NEO4J_PASSWORD;
    delete process.env.ELILEAI_NEO4J_DATABASE;
  });

  test("creates a Neo4jGraph using env vars", async () => {
    process.env.ELILEAI_NEO4J_URI = "bolt://localhost:7687";
    process.env.ELILEAI_NEO4J_USERNAME = "neo4j";
    process.env.ELILEAI_NEO4J_PASSWORD = "neo4j_dev";

    const { createNeo4jGraph } = await import("./neo4j-graph");
    const graph = createNeo4jGraph();
    expect(graph).toBeTruthy();
    expect(typeof graph.query).toBe("function");
    expect(typeof graph.addGraphDocuments).toBe("function");
  });

  test("creates a Neo4jGraph using explicit overrides", async () => {
    const { createNeo4jGraph } = await import("./neo4j-graph");
    const graph = createNeo4jGraph({
      url: "bolt://custom:7687",
      username: "user",
      password: "pass",
      database: "mydb",
    });
    expect(graph).toBeTruthy();
  });

  test("throws when env vars are missing", async () => {
    const { createNeo4jGraph } = await import("./neo4j-graph");
    expect(() => createNeo4jGraph()).toThrow(/ELILEAI_NEO4J_URI/);
  });
});
