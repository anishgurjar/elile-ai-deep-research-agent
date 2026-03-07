import { Auth } from "@langchain/langgraph-sdk/auth";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const auth = new Auth();

const CLERK_FRONTEND_API = process.env.CLERK_FRONTEND_API;

if (!CLERK_FRONTEND_API) {
  throw new Error("Missing required environment variable: CLERK_FRONTEND_API");
}

const clerkHost = CLERK_FRONTEND_API.replace(/^https?:\/\//, "");
const JWKS_URL = `https://${clerkHost}/.well-known/jwks.json`;
const CLERK_ISSUER = `https://${clerkHost}`;
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

auth.authenticate(async (request: Request) => {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Missing or invalid Authorization header");
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: CLERK_ISSUER });

    const userId = payload.sub;

    if (!userId) {
      throw new Error("Unauthorized: JWT missing 'sub' claim");
    }

    return {
      identity: userId,
      is_authenticated: true,
      display_name: (payload.name as string) || userId,
      permissions: [],
    };
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unknown error";
    throw new Error(`Unauthorized: JWT verification failed - ${message}`);
  }
});

auth.on("threads:create", async ({ value, user }) => {
  value.metadata = {
    ...value.metadata,
    user_id: user.identity,
  };
  return {};
});

auth.on("threads:search", async ({ user }) => {
  return {
    user_id: user.identity,
  };
});

auth.on("threads:read", async ({ user }) => {
  return {
    user_id: user.identity,
  };
});

auth.on("threads:update", async ({ user }) => {
  return {
    user_id: user.identity,
  };
});

auth.on("threads:delete", async ({ user }) => {
  return {
    user_id: user.identity,
  };
});

auth.on("threads:create_run", async ({ value, user }) => {
  if (value.kwargs && typeof value.kwargs === "object") {
    if (!("config" in value.kwargs) || !value.kwargs.config) {
      value.kwargs.config = {};
    }

    const config = value.kwargs.config as Record<string, unknown>;
    if (!("configurable" in config) || !config.configurable) {
      config.configurable = {};
    }

    const configurable = config.configurable as Record<string, unknown>;
    configurable.user_id = user.identity;
  }

  return {};
});
