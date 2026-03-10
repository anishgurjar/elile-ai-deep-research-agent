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
