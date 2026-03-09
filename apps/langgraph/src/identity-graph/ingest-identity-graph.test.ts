import { describe, expect, test, vi } from "vitest";
import { GraphDocument, Node, Relationship } from "@langchain/community/graphs/document";
import { Document } from "@langchain/core/documents";
import {
  ingestIdentityGraphFromResearch,
  type ResearchResult,
} from "./ingest-identity-graph";

function makeFakeGraphDocument(nodeCount: number, relCount: number): GraphDocument {
  return new GraphDocument({
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      id: `node-${i}`,
      type: "Person",
    })),
    relationships: Array.from({ length: relCount }, (_, i) => ({
      source: { id: `node-0`, type: "Person" },
      target: { id: `node-${i + 1}`, type: "Organization" },
      type: "ASSOCIATED_WITH",
    })),
    source: new Document({ pageContent: "test" }),
  });
}

function makeGraph() {
  return {
    addGraphDocuments: vi.fn(async () => undefined),
    query: vi.fn(async () => []),
  };
}

describe("ingestIdentityGraphFromResearch", () => {
  test("transforms research results and writes graph documents", async () => {
    const fakeGraphDoc = makeFakeGraphDocument(2, 1);
    const graph = makeGraph();
    const convertToGraphDocuments = vi.fn(async () => [fakeGraphDoc]);

    const result = await ingestIdentityGraphFromResearch({
      subject: "Ada Lovelace",
      threadId: "t1",
      researchResults: [
        {
          text: "Ada Lovelace was an English mathematician recognized as the first computer programmer.",
          scope: "identity",
          angle: "Identity confirmation",
        },
      ],
      graph,
      transformer: { convertToGraphDocuments },
      existingSchema: { nodeLabels: [], relationshipTypes: [] },
    });

    expect(convertToGraphDocuments).toHaveBeenCalledTimes(1);
    const docsArg = convertToGraphDocuments.mock.calls[0][0];
    expect(docsArg).toHaveLength(1);
    expect(docsArg[0].pageContent).toContain("Ada Lovelace");
    expect(docsArg[0].metadata.subject).toBe("Ada Lovelace");
    expect(docsArg[0].metadata.threadId).toBe("t1");
    expect(docsArg[0].metadata.scope).toBe("identity");

    expect(graph.addGraphDocuments).toHaveBeenCalledTimes(1);
    expect(graph.addGraphDocuments).toHaveBeenCalledWith([fakeGraphDoc], {
      includeSource: true,
    });

    expect(result.nodeCount).toBe(2);
    expect(result.relationshipCount).toBe(1);
  });

  test("normalizes node and relationship casing against existing schema", async () => {
    const badCasingDoc = new GraphDocument({
      nodes: [
        new Node({ id: "Ada Lovelace", type: "person" }),
        new Node({ id: "MIT", type: "ORGANIZATION" }),
      ],
      relationships: [
        new Relationship({
          source: new Node({ id: "Ada Lovelace", type: "person" }),
          target: new Node({ id: "MIT", type: "ORGANIZATION" }),
          type: "associated_with",
        }),
      ],
      source: new Document({ pageContent: "test" }),
    });

    const graph = makeGraph();
    const convertToGraphDocuments = vi.fn(async () => [badCasingDoc]);

    await ingestIdentityGraphFromResearch({
      subject: "Ada Lovelace",
      threadId: "t1",
      researchResults: [{ text: "Ada at MIT" }],
      graph,
      transformer: { convertToGraphDocuments },
      existingSchema: {
        nodeLabels: ["Person", "Organization"],
        relationshipTypes: ["ASSOCIATED_WITH"],
      },
    });

    const written = graph.addGraphDocuments.mock.calls[0][0][0];
    expect(written.nodes[0].type).toBe("Person");
    expect(written.nodes[1].type).toBe("Organization");
    expect(written.relationships[0].type).toBe("ASSOCIATED_WITH");
    expect(written.relationships[0].source.type).toBe("Person");
    expect(written.relationships[0].target.type).toBe("Organization");
  });

  test("normalizes new types to correct casing conventions", async () => {
    const newTypeDoc = new GraphDocument({
      nodes: [
        new Node({ id: "Nobel Prize", type: "award" }),
      ],
      relationships: [
        new Relationship({
          source: new Node({ id: "Ada", type: "Person" }),
          target: new Node({ id: "Nobel Prize", type: "award" }),
          type: "received award",
        }),
      ],
      source: new Document({ pageContent: "test" }),
    });

    const graph = makeGraph();
    const convertToGraphDocuments = vi.fn(async () => [newTypeDoc]);

    await ingestIdentityGraphFromResearch({
      subject: "Ada",
      threadId: "t1",
      researchResults: [{ text: "Ada received Nobel Prize" }],
      graph,
      transformer: { convertToGraphDocuments },
      existingSchema: { nodeLabels: ["Person"], relationshipTypes: [] },
    });

    const written = graph.addGraphDocuments.mock.calls[0][0][0];
    expect(written.nodes[0].type).toBe("Award");
    expect(written.relationships[0].type).toBe("RECEIVED_AWARD");
  });

  test("handles multiple research results", async () => {
    const doc1 = makeFakeGraphDocument(3, 2);
    const doc2 = makeFakeGraphDocument(1, 0);

    const graph = makeGraph();
    const convertToGraphDocuments = vi.fn(async () => [doc1, doc2]);

    const results: ResearchResult[] = [
      { text: "Result 1", scope: "identity" },
      { text: "Result 2", scope: "career" },
    ];

    const result = await ingestIdentityGraphFromResearch({
      subject: "Test Person",
      threadId: "t2",
      researchResults: results,
      graph,
      transformer: { convertToGraphDocuments },
      existingSchema: { nodeLabels: [], relationshipTypes: [] },
    });

    const docsArg = convertToGraphDocuments.mock.calls[0][0];
    expect(docsArg).toHaveLength(2);
    expect(result.nodeCount).toBe(4);
    expect(result.relationshipCount).toBe(2);
  });

  test("defaults scope and angle when not provided", async () => {
    const graph = makeGraph();
    const convertToGraphDocuments = vi.fn(async () => [
      makeFakeGraphDocument(0, 0),
    ]);

    await ingestIdentityGraphFromResearch({
      subject: "Someone",
      threadId: "t3",
      researchResults: [{ text: "Some findings" }],
      graph,
      transformer: { convertToGraphDocuments },
      existingSchema: { nodeLabels: [], relationshipTypes: [] },
    });

    const doc = convertToGraphDocuments.mock.calls[0][0][0];
    expect(doc.metadata.scope).toBe("general");
    expect(doc.metadata.angle).toBe("unknown");
  });
});
