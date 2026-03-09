import { describe, expect, test, vi } from "vitest";
import { GraphDocument } from "@langchain/community/graphs/document";
import { Document } from "@langchain/core/documents";
import { createIdentityGraphIngestTool } from "./identity-graph-tools";

describe("identity-graph-tools", () => {
  test("creates a tool with the correct name", () => {
    const tool = createIdentityGraphIngestTool();
    expect(tool.name).toBe("identity_graph_ingest");
  });

  test("calls ingestIdentityGraphFromResearch with correct args", async () => {
    const addGraphDocuments = vi.fn(async () => undefined);
    const query = vi.fn(async () => []);
    const convertToGraphDocuments = vi.fn(async () => [
      new GraphDocument({
        nodes: [{ id: "n1", type: "Person" }],
        relationships: [],
        source: new Document({ pageContent: "test" }),
      }),
    ]);

    const tool = createIdentityGraphIngestTool({
      createGraph: () => ({ addGraphDocuments, query }),
      createTransformer: () => ({ convertToGraphDocuments }),
    });

    const result = await tool.invoke({
      subject: "Ada Lovelace",
      threadId: "thread-123",
      researchResults: [
        {
          text: "Ada was an English mathematician.",
          scope: "identity",
          angle: "Background",
        },
      ],
    });

    expect(convertToGraphDocuments).toHaveBeenCalledTimes(1);
    expect(addGraphDocuments).toHaveBeenCalledTimes(1);
    expect(result).toContain("Ada Lovelace");
    expect(result).toContain("1 nodes");
  });

  test("transformer factory receives the graph instance", async () => {
    const graphInstance = {
      addGraphDocuments: vi.fn(async () => undefined),
      query: vi.fn(async () => []),
    };
    const createTransformer = vi.fn(() => ({
      convertToGraphDocuments: vi.fn(async () => [
        new GraphDocument({
          nodes: [],
          relationships: [],
          source: new Document({ pageContent: "test" }),
        }),
      ]),
    }));

    const tool = createIdentityGraphIngestTool({
      createGraph: () => graphInstance,
      createTransformer,
    });

    await tool.invoke({
      subject: "Test",
      threadId: "t1",
      researchResults: [{ text: "text" }],
    });

    expect(createTransformer).toHaveBeenCalledWith(graphInstance);
  });

  test("returns skip message when graph/transformer not configured", async () => {
    const tool = createIdentityGraphIngestTool();

    const result = await tool.invoke({
      subject: "Someone",
      threadId: "t1",
      researchResults: [{ text: "Some text" }],
    });

    expect(result).toContain("skipped");
  });
});
