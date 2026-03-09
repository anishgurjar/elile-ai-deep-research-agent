import { describe, expect, test, vi } from "vitest";
import { GraphDocument } from "@langchain/community/graphs/document";
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

describe("ingestIdentityGraphFromResearch", () => {
  test("transforms research results and writes graph documents", async () => {
    const fakeGraphDoc = makeFakeGraphDocument(2, 1);
    const addGraphDocuments = vi.fn(async () => undefined);
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
      graph: { addGraphDocuments } as any,
      transformer: { convertToGraphDocuments } as any,
    });

    expect(convertToGraphDocuments).toHaveBeenCalledTimes(1);
    const docsArg = convertToGraphDocuments.mock.calls[0][0];
    expect(docsArg).toHaveLength(1);
    expect(docsArg[0].pageContent).toContain("Ada Lovelace");
    expect(docsArg[0].metadata.subject).toBe("Ada Lovelace");
    expect(docsArg[0].metadata.threadId).toBe("t1");
    expect(docsArg[0].metadata.scope).toBe("identity");

    expect(addGraphDocuments).toHaveBeenCalledTimes(1);
    expect(addGraphDocuments).toHaveBeenCalledWith([fakeGraphDoc], {
      includeSource: true,
    });

    expect(result.nodeCount).toBe(2);
    expect(result.relationshipCount).toBe(1);
  });

  test("handles multiple research results", async () => {
    const doc1 = makeFakeGraphDocument(3, 2);
    const doc2 = makeFakeGraphDocument(1, 0);

    const addGraphDocuments = vi.fn(async () => undefined);
    const convertToGraphDocuments = vi.fn(async () => [doc1, doc2]);

    const results: ResearchResult[] = [
      { text: "Result 1", scope: "identity" },
      { text: "Result 2", scope: "career" },
    ];

    const result = await ingestIdentityGraphFromResearch({
      subject: "Test Person",
      threadId: "t2",
      researchResults: results,
      graph: { addGraphDocuments } as any,
      transformer: { convertToGraphDocuments } as any,
    });

    const docsArg = convertToGraphDocuments.mock.calls[0][0];
    expect(docsArg).toHaveLength(2);
    expect(result.nodeCount).toBe(4);
    expect(result.relationshipCount).toBe(2);
  });

  test("defaults scope and angle when not provided", async () => {
    const addGraphDocuments = vi.fn(async () => undefined);
    const convertToGraphDocuments = vi.fn(async () => [
      makeFakeGraphDocument(0, 0),
    ]);

    await ingestIdentityGraphFromResearch({
      subject: "Someone",
      threadId: "t3",
      researchResults: [{ text: "Some findings" }],
      graph: { addGraphDocuments } as any,
      transformer: { convertToGraphDocuments } as any,
    });

    const doc = convertToGraphDocuments.mock.calls[0][0][0];
    expect(doc.metadata.scope).toBe("general");
    expect(doc.metadata.angle).toBe("unknown");
  });
});
