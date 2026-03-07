import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

type AuthSuccess = {
  authenticated: true;
  token: string;
};

type AuthFailure = {
  authenticated: false;
  response: NextResponse;
};

export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const { userId, getToken } = await auth();

  if (!userId) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 },
      ),
    };
  }

  const token = await getToken();

  if (!token) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unable to retrieve session token." },
        { status: 401 },
      ),
    };
  }

  return {
    authenticated: true,
    token,
  };
}
