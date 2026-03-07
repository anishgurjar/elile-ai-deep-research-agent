import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // Generate a concise 4-word title using GPT-4o-mini
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Generate a concise, descriptive 4-word title for the following message. Only return the title, nothing else. Use title case.",
        },
        {
          role: "user",
          content: message,
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
