import { it, expect, describe } from "vitest";
import { graph } from "../graph/graph";

describe("Orchestrator Graph Structure", () => {
  it("should be defined with required methods", () => {
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
  });

  it("should have stream method for streaming responses", () => {
    expect(typeof graph.stream).toBe("function");
  });

  it("should have graph nodes", () => {
    expect(graph.nodes).toBeDefined();
    expect(Object.keys(graph.nodes).length).toBeGreaterThan(0);
  });
});
