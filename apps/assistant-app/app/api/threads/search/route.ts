import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../_middleware/auth";
import { createLangGraphClient } from "@/lib/integrations/langgraph";
import { searchThreadsBody } from "../../_middleware/schemas";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.authenticated) {
      return authResult.response;
    }

    const parsed = searchThreadsBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const client = createLangGraphClient(authResult.token);
    const threads = await client.searchThreads(parsed.data);
    return NextResponse.json(threads);
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
