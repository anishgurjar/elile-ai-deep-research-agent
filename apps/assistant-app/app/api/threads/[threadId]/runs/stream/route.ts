import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../_middleware/auth";
import { createLangGraphClient } from "@/lib/integrations/langgraph";
import type { StreamEvent } from "@/lib/integrations/langgraph";
import { threadIdParam, runBody } from "../../../../_middleware/schemas";

export const runtime = "edge";

type RouteParams = { params: Promise<{ threadId: string }> };

function toSseResponse(stream: AsyncGenerator<StreamEvent>): NextResponse {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of stream) {
          controller.enqueue(
            encoder.encode(
              `event: ${part.event}\ndata: ${JSON.stringify(part.data)}\n\n`,
            ),
          );
        }
      } catch (e) {
        const message =
          e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : "Unknown stream error";
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

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
    const stream = await client.streamRun(parsedId.data, parsed.data);
    return toSseResponse(stream);
  } catch (e: unknown) {
    const error = e as { message?: string; status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}
