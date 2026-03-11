import { describe, expect, test, vi } from "vitest";
import { createIdentityGraphReadTool } from "./read-tool";

describe("identity-graph-read-tool", () => {
  test("creates a readonly tool with content_and_artifact response", () => {
    const tool = createIdentityGraphReadTool({
      createChain: async () => ({
        invoke: vi.fn(async () => ({
          result: "ok",
          intermediateSteps: [{ query: "MATCH ..." }],
        })),
      }),
    });
    expect(tool.name).toBe("identity_graph_read");
    expect(tool.responseFormat).toBe("content_and_artifact");
  });

  test("preferred path: queries graph directly and returns knowledge when match exists", async () => {
    const graph = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          {
            nodeId: 123,
            labels: ["Person"],
            props: { id: "Timothy Silas Prugh Overturf" },
          },
        ])
        .mockResolvedValueOnce([
          {
            labels: ["Person"],
            node: { id: "Timothy Silas Prugh Overturf" },
            connections: [{ relationship: "ASSOCIATED_WITH" }],
          },
        ]),
      close: vi.fn(),
    };

    const tool = createIdentityGraphReadTool({
      createGraph: async () => graph,
    });

    const out = await tool.invoke({
      question: "What do we already know?",
      threadId: "t1",
      subject: "Timothy Silas Prugh Overturf",
    });

    expect(graph.query).toHaveBeenCalled();
    expect(out).toContain("Graph knowledge");
    expect(out).toContain("Timothy");
  });

  test("preferred path: matches when stored id is shorter than requested subject", async () => {
    const graph = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          {
            nodeId: 99,
            labels: ["Person"],
            props: { id: "Timothy Overturf" },
          },
        ])
        .mockResolvedValueOnce([
          {
            labels: ["Person"],
            node: { id: "Timothy Overturf" },
            connections: [],
          },
        ]),
      close: vi.fn(),
    };

    const tool = createIdentityGraphReadTool({
      createGraph: async () => graph,
    });

    const out = await tool.invoke({
      question: "What do we already know?",
      threadId: "t1",
      subject: "Timothy Silas Prugh Overturf",
    });

    expect(out).toContain("Graph knowledge");
    expect(out).toContain("Timothy Overturf");
  });

  test("explicit cypher path: runs provided MATCH query with params", async () => {
    const graph = {
      query: vi.fn(async () => [{ id: "Timothy Silas Prugh Overturf" }]),
      close: vi.fn(),
    };

    const tool = createIdentityGraphReadTool({
      createGraph: async () => graph,
    });

    const out = await tool.invoke({
      question: "Load person node",
      threadId: "t1",
      subject: "Timothy Silas Prugh Overturf",
      cypher:
        "MATCH (p:Person) WHERE toLower(p.id) CONTAINS toLower($q) RETURN properties(p) AS p LIMIT 5",
      params: { q: "overturf" },
    });

    expect(graph.query).toHaveBeenCalledTimes(1);
    expect(out).toContain("Graph knowledge");
  });

  test("explicit cypher path: rejects unsafe cypher", async () => {
    const graph = {
      query: vi.fn(async () => []),
      close: vi.fn(),
    };

    const tool = createIdentityGraphReadTool({
      createGraph: async () => graph,
    });

    const out = await tool.invoke({
      question: "bad",
      threadId: "t1",
      subject: "X",
      cypher: "MATCH (n) DETACH DELETE n RETURN 1",
    });

    expect(out).toContain("rejected");
    expect(graph.query).not.toHaveBeenCalled();
  });

  test("preferred path: returns no-knowledge message when nothing matches", async () => {
    const graph = {
      query: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      close: vi.fn(),
    };

    const tool = createIdentityGraphReadTool({
      createGraph: async () => graph,
    });

    const out = await tool.invoke({
      question: "What do we already know?",
      threadId: "t1",
      subject: "Nobody",
    });

    expect(out).toContain("No existing knowledge found");
  });

  test("invokes chain and returns summary + artifact", async () => {
    const invoke = vi.fn(async () => ({
      result: "Ada Lovelace was a mathematician.",
      intermediateSteps: [
        { query: "MATCH (p:Person) WHERE p.id = 'Ada Lovelace' RETURN p" },
        { context: [{ name: "Ada Lovelace" }] },
      ],
    }));

    const tool = createIdentityGraphReadTool({
      createChain: async () => ({ invoke }),
    });

    const out = await tool.invoke({
      question: "What do we already know about Ada Lovelace?",
      threadId: "t1",
      subject: "Ada Lovelace",
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({
      query: "What do we already know about Ada Lovelace?\n\nSubject: Ada Lovelace",
    });
    expect(out).toContain("Ada Lovelace");
  });

  test("returns skip message when chain not configured", async () => {
    const tool = createIdentityGraphReadTool();

    const out = await tool.invoke({
      question: "What is known?",
      threadId: "t1",
      subject: "Test",
    });

    expect(out).toContain("skipped");
  });

  test("returns error message to LLM when chain setup fails", async () => {
    const tool = createIdentityGraphReadTool({
      createChain: async () => {
        throw new Error("SHOW CONSTRAINTS not allowed for user 'neo4j_read'");
      },
    });

    const out = await tool.invoke({
      question: "What is known?",
      threadId: "t1",
      subject: "Test",
    });

    expect(out).toContain("failed during setup");
    expect(out).toContain("SHOW CONSTRAINTS");
  });

  test("returns error message to LLM when chain invoke fails", async () => {
    const tool = createIdentityGraphReadTool({
      createChain: async () => ({
        invoke: vi.fn(async () => {
          throw new Error("Invalid Cypher syntax");
        }),
      }),
    });

    const out = await tool.invoke({
      question: "What is known about X?",
      threadId: "t1",
      subject: "X",
    });

    expect(out).toContain("query failed");
    expect(out).toContain("Invalid Cypher syntax");
    expect(out).toContain("Proceed with web research");
  });
});
