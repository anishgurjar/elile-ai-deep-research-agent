import { describe, it, expect } from "vitest";
import { auth } from "./auth";

describe("Authentication Handler", () => {
  describe("authenticate handler", () => {
    const authenticateHandler = auth["~handlerCache"].authenticate;

    it("should be registered", () => {
      expect(authenticateHandler).toBeDefined();
    });

    it("should reject requests without Authorization header", async () => {
      if (!authenticateHandler) throw new Error("Handler not registered");

      const request = new Request("http://localhost");

      await expect(authenticateHandler(request)).rejects.toThrow(
        "Unauthorized: Missing or invalid Authorization header",
      );
    });

    it("should reject requests with non-Bearer Authorization", async () => {
      if (!authenticateHandler) throw new Error("Handler not registered");

      const request = new Request("http://localhost", {
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });

      await expect(authenticateHandler(request)).rejects.toThrow(
        "Unauthorized: Missing or invalid Authorization header",
      );
    });

    it("should reject malformed JWT tokens", async () => {
      if (!authenticateHandler) throw new Error("Handler not registered");

      const request = new Request("http://localhost", {
        headers: { authorization: "Bearer not-a-jwt" },
      });

      await expect(authenticateHandler(request)).rejects.toThrow(
        /Unauthorized: JWT verification failed/,
      );
    });

    it("should reject invalid JWT tokens", async () => {
      if (!authenticateHandler) throw new Error("Handler not registered");

      const request = new Request("http://localhost", {
        headers: { authorization: "Bearer invalid.jwt.token" },
      });

      await expect(authenticateHandler(request)).rejects.toThrow(
        /Unauthorized: JWT verification failed/,
      );
    });
  });

  describe("authorization handlers", () => {
    const callbacks = auth["~handlerCache"].callbacks;

    it("should register all required handlers", () => {
      expect(callbacks).toBeDefined();
      expect(callbacks?.["threads:create"]).toBeDefined();
      expect(callbacks?.["threads:search"]).toBeDefined();
      expect(callbacks?.["threads:read"]).toBeDefined();
      expect(callbacks?.["threads:update"]).toBeDefined();
      expect(callbacks?.["threads:delete"]).toBeDefined();
      expect(callbacks?.["threads:create_run"]).toBeDefined();
    });

    describe("threads:create", () => {
      it("should inject user_id into metadata", async () => {
        const createHandler = callbacks?.["threads:create"];
        if (!createHandler) throw new Error("Handler not registered");

        const value = { metadata: { existing: "data" } };
        const user = {
          identity: "user_123",
          is_authenticated: true,
          display_name: "Test",
          permissions: [],
        };

        await createHandler({
          event: "threads:create",
          resource: "threads",
          action: "create",
          value,
          user,
          permissions: [],
        } as never);

        expect(value.metadata).toEqual({
          existing: "data",
          user_id: "user_123",
        });
      });

      it("should preserve existing metadata when injecting user_id", async () => {
        const createHandler = callbacks?.["threads:create"];
        if (!createHandler) throw new Error("Handler not registered");

        const value = {
          metadata: {
            custom_field: "value",
            another_field: 123,
          },
        };
        const user = {
          identity: "user_456",
          is_authenticated: true,
          display_name: "Test",
          permissions: [],
        };

        await createHandler({
          event: "threads:create",
          resource: "threads",
          action: "create",
          value,
          user,
          permissions: [],
        } as never);

        expect(value.metadata).toEqual({
          custom_field: "value",
          another_field: 123,
          user_id: "user_456",
        });
      });
    });

    describe("threads:search", () => {
      it("should return user_id filter", async () => {
        const searchHandler = callbacks?.["threads:search"];
        if (!searchHandler) throw new Error("Handler not registered");

        const user = {
          identity: "user_789",
          is_authenticated: true,
          display_name: "Test",
          permissions: [],
        };

        const result = await searchHandler({
          event: "threads:search",
          resource: "threads",
          action: "search",
          value: {},
          user,
          permissions: [],
        } as never);

        expect(result).toEqual({ user_id: "user_789" });
      });
    });

    describe("threads:read, threads:update, threads:delete", () => {
      it("should all return user_id filter for ownership validation", async () => {
        const readHandler = callbacks?.["threads:read"];
        const updateHandler = callbacks?.["threads:update"];
        const deleteHandler = callbacks?.["threads:delete"];

        if (!readHandler || !updateHandler || !deleteHandler) {
          throw new Error("Handlers not registered");
        }

        const user = {
          identity: "user_abc",
          is_authenticated: true,
          display_name: "Test",
          permissions: [],
        };

        const params = {
          value: {},
          user,
          permissions: [],
        };

        const readResult = await readHandler({
          ...params,
          event: "threads:read",
          resource: "threads",
          action: "read",
        } as never);

        const updateResult = await updateHandler({
          ...params,
          event: "threads:update",
          resource: "threads",
          action: "update",
        } as never);

        const deleteResult = await deleteHandler({
          ...params,
          event: "threads:delete",
          resource: "threads",
          action: "delete",
        } as never);

        expect(readResult).toEqual({ user_id: "user_abc" });
        expect(updateResult).toEqual({ user_id: "user_abc" });
        expect(deleteResult).toEqual({ user_id: "user_abc" });
      });
    });

    describe("threads:create_run", () => {
      it("should inject user_id into config.configurable", async () => {
        const createRunHandler = callbacks?.["threads:create_run"];
        if (!createRunHandler) throw new Error("Handler not registered");

        const value = {
          kwargs: {
            config: {
              configurable: { existing: "config" },
            },
          },
        };
        const user = {
          identity: "user_xyz",
          is_authenticated: true,
          display_name: "Test",
          permissions: [],
        };

        await createRunHandler({
          event: "threads:create_run",
          resource: "threads",
          action: "create_run",
          value,
          user,
          permissions: [],
        } as never);

        expect(value.kwargs.config.configurable).toEqual({
          existing: "config",
          user_id: "user_xyz",
        });
      });

      it("should create config structure if it doesn't exist", async () => {
        const createRunHandler = callbacks?.["threads:create_run"];
        if (!createRunHandler) throw new Error("Handler not registered");

        const value = {
          kwargs: {},
        };
        const user = {
          identity: "user_new",
          is_authenticated: true,
          display_name: "Test",
          permissions: [],
        };

        await createRunHandler({
          event: "threads:create_run",
          resource: "threads",
          action: "create_run",
          value,
          user,
          permissions: [],
        } as never);

        expect(value.kwargs).toHaveProperty("config");
        const config = value.kwargs as {
          config?: { configurable?: { user_id?: string } };
        };
        expect(config.config).toBeDefined();
        expect(config.config?.configurable).toBeDefined();
        expect(config.config?.configurable?.user_id).toBe("user_new");
      });
    });
  });
});
