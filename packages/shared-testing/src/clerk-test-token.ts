const CLERK_API_BASE = "https://api.clerk.com/v1";

export interface ClerkTestTokenConfig {
  secretKey?: string;
  userId?: string;
}

/**
 * Programmatically creates a Clerk session and returns a fresh session JWT
 * via the Backend API (POST /sessions → POST /sessions/{id}/tokens).
 *
 * Avoids the need to manually copy short-lived JWTs from the browser.
 * Requires CLERK_SECRET_KEY and CLERK_TEST_USER_ID env vars, or pass them
 * explicitly. Returns a dummy placeholder when credentials aren't available for polly replay.
 */
export async function fetchClerkSessionToken(
  config: ClerkTestTokenConfig = {},
): Promise<string> {
  const secretKey = config.secretKey ?? process.env["CLERK_SECRET_KEY"];
  const userId = config.userId ?? process.env["CLERK_TEST_USER_ID"];

  if (!secretKey || !userId) {
    return "test-user-token";
  }

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };

  const sessionRes = await fetch(`${CLERK_API_BASE}/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: userId }),
  });

  if (!sessionRes.ok) {
    const body = await sessionRes.text();
    throw new Error(`Clerk POST /sessions failed (${sessionRes.status}): ${body}`);
  }

  const session: { id: string } = await sessionRes.json();

  const tokenRes = await fetch(`${CLERK_API_BASE}/sessions/${session.id}/tokens`, {
    method: "POST",
    headers,
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(
      `Clerk POST /sessions/${session.id}/tokens failed (${tokenRes.status}): ${body}`,
    );
  }

  const tokenData: { jwt: string } = await tokenRes.json();
  return tokenData.jwt;
}
