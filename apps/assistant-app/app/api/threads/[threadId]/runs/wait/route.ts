import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../_middleware/auth";
import { createLangGraphClient } from "@/lib/integrations/langgraph";
import { threadIdParam, runBody } from "../../../../_middleware/schemas";

export const runtime = "edge";

type RouteParams = { params: Promise<{ threadId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (!authResult.authenticated) {
      return authResult.response;
    }

    const parsedId = threadIdParam.safeParse((await params).threadId);
    if (!parsedId.success) {
      return NextResponse.json({ error: parsedId.error.issues }, { status: 400 });
    }

    const parsed = runBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const client = createLangGraphClient(authResult.token);
    const result = await client.waitRun(parsedId.data, parsed.data);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
