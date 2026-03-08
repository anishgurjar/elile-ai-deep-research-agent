import { describe, expect, test } from "vitest";
import { prompt } from "./prompt";

describe("orchestrator core prompt", () => {
  test("contains the agent mission", () => {
    expect(prompt).toMatch(/Orchestrator Agent/i);
    expect(prompt).toMatch(/Mission/i);
  });

  test("contains core response guidelines", () => {
    expect(prompt).toMatch(/Response Guidelines/i);
  });

  test("does not inline the skills system (handled by middleware)", () => {
    expect(prompt).not.toMatch(/load_skill/i);
    expect(prompt).not.toMatch(/Available Skills/i);
  });

  test("directs scope seeding, off-scope leads, and final synthesis", () => {
    expect(prompt).toMatch(/confirm/i);
    expect(prompt).toMatch(/3[–-]4/);
    expect(prompt).toMatch(/out_of_scope_leads/i);
    expect(prompt).toMatch(/summar/i);
  });
});
