import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../../_middleware/auth";
import { threadIdParam } from "../../../../../_middleware/schemas";
import { z } from "zod";

export const runtime = "edge";

type RouteParams = { params: Promise<{ threadId: string; runId: string }> };

function resolveLangGraphBaseUrl(): string {
  const baseUrl =
    process.env["LANGGRAPH_API_URL"] ?? process.env["NEXT_PUBLIC_LANGGRAPH_API_URL"];
  if (!baseUrl) {
    throw new Error("LANGGRAPH_API_URL is not configured");
  }
  return baseUrl;
}

const runIdParam = z.string().uuid("runId must be a valid UUID");

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth();
    if (!authResult.authenticated) {
      return authResult.response;
    }

    const { threadId, runId } = await params;
    const parsedThread = threadIdParam.safeParse(threadId);
    if (!parsedThread.success) {
      return NextResponse.json(
        { error: parsedThread.error.issues },
        { status: 400 },
      );
    }

    const parsedRun = runIdParam.safeParse(runId);
    if (!parsedRun.success) {
      return NextResponse.json({ error: parsedRun.error.issues }, { status: 400 });
    }

    const baseUrl = resolveLangGraphBaseUrl();
    const apiKey = process.env["LANGCHAIN_API_KEY"];

    const url = new URL(
      `${baseUrl}/threads/${parsedThread.data}/runs/${parsedRun.data}/stream`,
    );
    for (const mode of ["messages", "updates", "events", "values"]) {
      url.searchParams.append("stream_mode", mode);
    }

    const lastEventId = req.headers.get("Last-Event-ID");

    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authResult.token}`,
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
      },
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
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}

