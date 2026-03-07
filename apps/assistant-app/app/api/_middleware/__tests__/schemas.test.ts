import { describe, it, expect } from "vitest";
import {
  threadIdParam,
  createThreadBody,
  searchThreadsBody,
  updateThreadBody,
  runBody,
} from "../schemas";

describe("schemas", () => {
  describe("threadIdParam", () => {
    it("should accept a valid UUID", () => {
      const result = threadIdParam.safeParse(
        "550e8400-e29b-41d4-a716-446655440000",
      );
      expect(result.success).toBe(true);
    });

    it("should reject a non-UUID string", () => {
      const result = threadIdParam.safeParse("not-a-uuid");
      expect(result.success).toBe(false);
    });

    it("should reject an empty string", () => {
      const result = threadIdParam.safeParse("");
      expect(result.success).toBe(false);
    });

    it("should reject a path traversal attempt", () => {
      const result = threadIdParam.safeParse("../../../etc/passwd");
      expect(result.success).toBe(false);
    });
  });

  describe("createThreadBody", () => {
    it("should accept empty object", () => {
      const result = createThreadBody.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept object with metadata", () => {
      const result = createThreadBody.safeParse({ metadata: { key: "value" } });
      expect(result.success).toBe(true);
    });

    it("should reject metadata that is not an object", () => {
      const result = createThreadBody.safeParse({ metadata: "string" });
      expect(result.success).toBe(false);
    });
  });

  describe("searchThreadsBody", () => {
    it("should accept valid search params", () => {
      const result = searchThreadsBody.safeParse({
        metadata: {},
        limit: 100,
        offset: 0,
        sortBy: "updated_at",
      });
      expect(result.success).toBe(true);
    });

    it("should reject limit above 100", () => {
      const result = searchThreadsBody.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it("should reject limit below 1", () => {
      const result = searchThreadsBody.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it("should reject negative offset", () => {
      const result = searchThreadsBody.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });

    it("should reject invalid sortBy value", () => {
      const result = searchThreadsBody.safeParse({ sortBy: "hacked" });
      expect(result.success).toBe(false);
    });

    it("should accept valid sortBy values", () => {
      for (const field of ["created_at", "updated_at"]) {
        const result = searchThreadsBody.safeParse({ sortBy: field });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("updateThreadBody", () => {
    it("should accept object with metadata", () => {
      const result = updateThreadBody.safeParse({
        metadata: { title: "test" },
      });
      expect(result.success).toBe(true);
    });

    it("should accept empty object", () => {
      const result = updateThreadBody.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("runBody", () => {
    it("should accept valid run payload", () => {
      const result = runBody.safeParse({
        assistant_id: "550e8400-e29b-41d4-a716-446655440000",
        input: { messages: [] },
        stream_mode: ["messages", "updates"],
        config: {},
      });
      expect(result.success).toBe(true);
    });

    it("should require assistant_id", () => {
      const result = runBody.safeParse({ input: null });
      expect(result.success).toBe(false);
    });

    it("should accept a graph name as assistant_id", () => {
      const result = runBody.safeParse({ assistant_id: "elileai-conventional" });
      expect(result.success).toBe(true);
    });

    it("should reject empty assistant_id", () => {
      const result = runBody.safeParse({ assistant_id: "" });
      expect(result.success).toBe(false);
    });

    it("should accept null input", () => {
      const result = runBody.safeParse({
        assistant_id: "550e8400-e29b-41d4-a716-446655440000",
        input: null,
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid stream_mode values", () => {
      const result = runBody.safeParse({
        assistant_id: "550e8400-e29b-41d4-a716-446655440000",
        stream_mode: ["invalid"],
      });
      expect(result.success).toBe(false);
    });

    it("should accept all valid stream_mode values", () => {
      const result = runBody.safeParse({
        assistant_id: "550e8400-e29b-41d4-a716-446655440000",
        stream_mode: ["messages", "updates", "events", "values"],
      });
      expect(result.success).toBe(true);
    });
  });
});
