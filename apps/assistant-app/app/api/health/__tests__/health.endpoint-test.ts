import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /api/health", () => {
  it("should return 200 with OK body", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });
});
