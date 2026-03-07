import { describe, it, expect, beforeEach, vi, type MockedFunction } from "vitest";
import { requireAuth } from "../auth";
import { auth } from "@clerk/nextjs/server";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockAuth = auth as MockedFunction<typeof auth>;

type MockAuthReturn = Awaited<ReturnType<typeof auth>>;

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuth", () => {
    it("should return authenticated true with token when user is authenticated", async () => {
      const mockToken = "mock-jwt-token-12345";
      const mockGetToken = vi.fn().mockResolvedValue(mockToken);

      mockAuth.mockResolvedValue({
        userId: "user_123",
        getToken: mockGetToken,
        sessionClaims: null,
        sessionId: "session_123",
        sessionStatus: "active",
        actor: null,
        orgId: null,
        orgRole: null,
        orgSlug: null,
        orgPermissions: null,
        has: vi.fn(),
        debug: vi.fn(),
      } as unknown as MockAuthReturn);

      const result = await requireAuth();

      expect(result).toEqual({
        authenticated: true,
        token: mockToken,
      });
      expect(mockGetToken).toHaveBeenCalledTimes(1);
    });

    it("should return authenticated false with 401 response when userId is missing", async () => {
      mockAuth.mockResolvedValue({
        userId: null,
        getToken: vi.fn(),
        sessionClaims: null,
        sessionId: null,
        sessionStatus: "inactive",
        actor: null,
        orgId: null,
        orgRole: null,
        orgSlug: null,
        orgPermissions: null,
        has: vi.fn(),
        debug: vi.fn(),
      } as unknown as MockAuthReturn);

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        const json = await result.response.json();
        expect(json).toEqual({ error: "Unauthorized. Please sign in." });
        expect(result.response.status).toBe(401);
      }
    });

    it("should return authenticated false with 401 response when token is null", async () => {
      const mockGetToken = vi.fn().mockResolvedValue(null);

      mockAuth.mockResolvedValue({
        userId: "user_123",
        getToken: mockGetToken,
        sessionClaims: null,
        sessionId: "session_123",
        sessionStatus: "active",
        actor: null,
        orgId: null,
        orgRole: null,
        orgSlug: null,
        orgPermissions: null,
        has: vi.fn(),
        debug: vi.fn(),
      } as unknown as MockAuthReturn);

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        const json = await result.response.json();
        expect(json).toEqual({ error: "Unable to retrieve session token." });
        expect(result.response.status).toBe(401);
      }
      expect(mockGetToken).toHaveBeenCalledTimes(1);
    });

    it("should return authenticated false with 401 response when token is undefined", async () => {
      const mockGetToken = vi.fn().mockResolvedValue(undefined);

      mockAuth.mockResolvedValue({
        userId: "user_123",
        getToken: mockGetToken,
        sessionClaims: null,
        sessionId: "session_123",
        sessionStatus: "active",
        actor: null,
        orgId: null,
        orgRole: null,
        orgSlug: null,
        orgPermissions: null,
        has: vi.fn(),
        debug: vi.fn(),
      } as unknown as MockAuthReturn);

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        const json = await result.response.json();
        expect(json).toEqual({ error: "Unable to retrieve session token." });
        expect(result.response.status).toBe(401);
      }
    });

    it("should handle case when both userId and token are missing", async () => {
      mockAuth.mockResolvedValue({
        userId: null,
        getToken: vi.fn().mockResolvedValue(null),
        sessionClaims: null,
        sessionId: null,
        sessionStatus: "inactive",
        actor: null,
        orgId: null,
        orgRole: null,
        orgSlug: null,
        orgPermissions: null,
        has: vi.fn(),
        debug: vi.fn(),
      } as unknown as MockAuthReturn);

      const result = await requireAuth();

      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        const json = await result.response.json();
        expect(json).toEqual({ error: "Unauthorized. Please sign in." });
        expect(result.response.status).toBe(401);
      }
    });
  });
});
