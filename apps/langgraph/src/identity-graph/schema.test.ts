import { describe, expect, test, vi } from "vitest";
import { GraphDocument, Node, Relationship } from "@langchain/community/graphs/document";
import { Document } from "@langchain/core/documents";
import {
  fetchExistingSchema,
  buildSchemaAwarePrompt,
  normalizeGraphDocuments,
} from "./schema";

describe("fetchExistingSchema", () => {
  test("extracts labels and relationship types from Neo4j", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ label: "Person" }, { label: "Organization" }])
      .mockResolvedValueOnce([{ type: "ASSOCIATED_WITH" }]);

    const schema = await fetchExistingSchema({ query });

    expect(schema.nodeLabels).toEqual(["Person", "Organization"]);
    expect(schema.relationshipTypes).toEqual(["ASSOCIATED_WITH"]);
  });

  test("filters out internal labels", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([
        { label: "Person" },
        { label: "__Entity__" },
        { label: "Document" },
      ])
      .mockResolvedValueOnce([]);

    const schema = await fetchExistingSchema({ query });

    expect(schema.nodeLabels).toEqual(["Person"]);
  });

  test("returns empty arrays on query failure", async () => {
    const query = vi.fn().mockRejectedValue(new Error("connection refused"));

    const schema = await fetchExistingSchema({ query });

    expect(schema.nodeLabels).toEqual([]);
    expect(schema.relationshipTypes).toEqual([]);
  });
});

describe("buildSchemaAwarePrompt", () => {
  test("includes existing types in the prompt", () => {
    const prompt = buildSchemaAwarePrompt({
      nodeLabels: ["Person", "Organization"],
      relationshipTypes: ["ASSOCIATED_WITH"],
    });

    const messages = prompt.promptMessages;
    const systemMsg = messages[0];
    // The system message template should contain existing types
    const template = JSON.stringify(systemMsg);
    expect(template).toContain("Person");
    expect(template).toContain("Organization");
    expect(template).toContain("ASSOCIATED_WITH");
    expect(template).toContain("REUSE");
  });

  test("handles empty schema gracefully", () => {
    const prompt = buildSchemaAwarePrompt({
      nodeLabels: [],
      relationshipTypes: [],
    });

    const template = JSON.stringify(prompt.promptMessages[0]);
    expect(template).toContain("empty");
    expect(template).toContain("initial schema");
  });
});

describe("normalizeGraphDocuments", () => {
  test("matches existing types case-insensitively", () => {
    const doc = new GraphDocument({
      nodes: [
        new Node({ id: "Ada", type: "person" }),
        new Node({ id: "MIT", type: "ORGANIZATION" }),
      ],
      relationships: [
        new Relationship({
          source: new Node({ id: "Ada", type: "person" }),
          target: new Node({ id: "MIT", type: "ORGANIZATION" }),
          type: "associated_with",
        }),
      ],
      source: new Document({ pageContent: "test" }),
    });

    normalizeGraphDocuments([doc], {
      nodeLabels: ["Person", "Organization"],
      relationshipTypes: ["ASSOCIATED_WITH"],
    });

    expect(doc.nodes[0].type).toBe("Person");
    expect(doc.nodes[1].type).toBe("Organization");
    expect(doc.relationships[0].type).toBe("ASSOCIATED_WITH");
  });

  test("normalizes new node types to PascalCase", () => {
    const doc = new GraphDocument({
      nodes: [new Node({ id: "x", type: "social media" })],
      relationships: [],
      source: new Document({ pageContent: "test" }),
    });

    normalizeGraphDocuments([doc], { nodeLabels: [], relationshipTypes: [] });

    expect(doc.nodes[0].type).toBe("SocialMedia");
  });

  test("normalizes new relationship types to UPPER_SNAKE_CASE", () => {
    const doc = new GraphDocument({
      nodes: [],
      relationships: [
        new Relationship({
          source: new Node({ id: "a", type: "Person" }),
          target: new Node({ id: "b", type: "Organization" }),
          type: "workedAt",
        }),
      ],
      source: new Document({ pageContent: "test" }),
    });

    normalizeGraphDocuments([doc], { nodeLabels: [], relationshipTypes: [] });

    expect(doc.relationships[0].type).toBe("WORKED_AT");
  });

  test("trims whitespace from node IDs", () => {
    const doc = new GraphDocument({
      nodes: [new Node({ id: "  Ada Lovelace  ", type: "Person" })],
      relationships: [],
      source: new Document({ pageContent: "test" }),
    });

    normalizeGraphDocuments([doc], { nodeLabels: [], relationshipTypes: [] });

    expect(doc.nodes[0].id).toBe("Ada Lovelace");
  });
});
