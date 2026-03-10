import { describe, expect, test, beforeAll, afterAll } from "vitest";
import neo4j, { type Driver } from "neo4j-driver";
import { Document } from "@langchain/core/documents";
import { GraphDocument, Node, Relationship } from "@langchain/community/graphs/document";
import { Neo4jGraph } from "@langchain/community/graphs/neo4j_graph";
import { ingestIdentityGraphFromResearch } from "./ingest-identity-graph";

const NEO4J_URI = process.env.ELILEAI_NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USER = process.env.ELILEAI_NEO4J_USERNAME ?? "neo4j";
const NEO4J_PASS = process.env.ELILEAI_NEO4J_PASSWORD ?? "neo4j_dev";
const NEO4J_DB = process.env.ELILEAI_NEO4J_DATABASE ?? "neo4j";

const SAFE_TEST_DATABASE = "elileai_test";
const describeIfSafe =
  NEO4J_DB === SAFE_TEST_DATABASE ? describe : describe.skip;

describeIfSafe("ingestIdentityGraph (integration)", () => {
  let driver: Driver;
  let graph: Neo4jGraph;

  beforeAll(async () => {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    await driver.getServerInfo();

    graph = new Neo4jGraph({
      url: NEO4J_URI,
      username: NEO4J_USER,
      password: NEO4J_PASS,
      database: NEO4J_DB,
    });

    // Clean test data (SAFE: only runs against the dedicated test database)
    const session = driver.session({ database: NEO4J_DB });
    try {
      await session.run("MATCH (n) DETACH DELETE n");
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    await graph.close();
    await driver.close();
  });

  test("writes Person and Source nodes to Neo4j", async () => {
    const fakeTransformer = {
      convertToGraphDocuments: async (docs: Document[]) => {
        return docs.map(
          (doc) =>
            new GraphDocument({
              nodes: [
                new Node({ id: "Ada Lovelace", type: "Person" }),
                new Node({ id: "University of London", type: "Organization" }),
                new Node({ id: "https://example.com/ada", type: "Source" }),
              ],
              relationships: [
                new Relationship({
                  source: new Node({ id: "Ada Lovelace", type: "Person" }),
                  target: new Node({ id: "University of London", type: "Organization" }),
                  type: "ASSOCIATED_WITH",
                }),
              ],
              source: doc,
            }),
        );
      },
    };

    const result = await ingestIdentityGraphFromResearch({
      subject: "Ada Lovelace",
      threadId: "int-test-thread",
      researchResults: [
        {
          text: "Ada Lovelace was an English mathematician associated with University of London.",
          scope: "identity",
          angle: "Background",
        },
      ],
      graph,
      transformer: fakeTransformer,
    });

    expect(result.nodeCount).toBe(3);
    expect(result.relationshipCount).toBe(1);

    // Verify nodes exist in Neo4j
    const session = driver.session({ database: NEO4J_DB });
    try {
      const personResult = await session.run(
        "MATCH (n:Person) RETURN n.id AS id",
      );
      const personIds = personResult.records.map((r) => r.get("id"));
      expect(personIds).toContain("Ada Lovelace");

      const orgResult = await session.run(
        "MATCH (n:Organization) RETURN n.id AS id",
      );
      const orgIds = orgResult.records.map((r) => r.get("id"));
      expect(orgIds).toContain("University of London");

      const relResult = await session.run(
        "MATCH (p:Person)-[r:ASSOCIATED_WITH]->(o:Organization) RETURN p.id AS person, o.id AS org",
      );
      expect(relResult.records.length).toBeGreaterThanOrEqual(1);
      expect(relResult.records[0].get("person")).toBe("Ada Lovelace");
      expect(relResult.records[0].get("org")).toBe("University of London");
    } finally {
      await session.close();
    }
  });
});
