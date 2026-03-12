import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../_middleware/auth";
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

    const baseUrl = process.env["NEXT_PUBLIC_LANGGRAPH_API_URL"];
    if (!baseUrl) {
      throw new Error("NEXT_PUBLIC_LANGGRAPH_API_URL is not configured");
    }

    const upstream = await fetch(`${baseUrl}/threads/${parsedId.data}/runs/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authResult.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    const message =
      e && typeof e === "object" && "message" in e
        ? String((e as { message?: unknown }).message)
        : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
