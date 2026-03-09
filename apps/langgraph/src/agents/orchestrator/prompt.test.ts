import { describe, expect, test } from "vitest";
import { prompt } from "./prompt";

describe("orchestrator core prompt", () => {
  test("contains the agent mission", () => {
    expect(prompt).toMatch(/Orchestrator Agent/i);
    expect(prompt).toMatch(/Mission/i);
  });

  test("scopes research to people only", () => {
    expect(prompt).toMatch(/only performs deep research on people/i);
  });

  test("instructs identity graph ingestion after research", () => {
    expect(prompt).toMatch(/identity_graph_ingest/);
    expect(prompt).toMatch(/after.*subagent research/i);
  });

  test("contains core response guidelines", () => {
    expect(prompt).toMatch(/Response Guidelines/i);
  });

  test("does not inline the skills system (handled by middleware)", () => {
    expect(prompt).not.toMatch(/load_skill/i);
    expect(prompt).not.toMatch(/Available Skills/i);
  });
});
