import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAuth } from "../_middleware/auth";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.authenticated) {
      return authResult.response;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured" },
        { status: 500 },
      );
    }
    const openai = new OpenAI({
      apiKey,
    });

    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const trimmed = message.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ title: "New Conversation" });
    }

    // Generate a concise 4-word title using gpt-4o-mini
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Write a concise 4-word title in title case. Output ONLY the title text (no quotes, no punctuation, no extra words).",
        },
        {
          role: "user",
          content: trimmed.slice(0, 4000),
        },
      ],
      max_tokens: 20,
      temperature: 0.7,
    });

    const title =
      completion.choices[0]?.message?.content?.trim() || "New Conversation";

    return NextResponse.json({ title });
  } catch (error: unknown) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate title", details: errorMessage },
      { status: 500 },
    );
  }
}
