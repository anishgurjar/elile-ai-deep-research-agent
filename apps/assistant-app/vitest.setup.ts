import { vi } from "vitest";
import { loadTestEnv } from "@elileai/shared-testing";
import "./test-utils/langgraph-proxy-matcher";

loadTestEnv(import.meta.dirname);

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
