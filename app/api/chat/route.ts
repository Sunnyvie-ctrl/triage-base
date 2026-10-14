import { NextResponse } from "next/server";
import { llm, model } from "../../../lib/llm";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // Validate shape
  if (
    typeof body !== "object" ||
    body === null ||
    !("messages" in body)
  ) {
    return NextResponse.json(
      { error: "Missing messages array." },
      { status: 400 }
    );
  }

  const { messages } = body as {
    messages: Array<{ role: string; content: string }>;
  };

  if (!Array.isArray(messages)) {
    return NextResponse.json(
      { error: "messages must be an array." },
      { status: 400 }
    );
  }

  const hasUserMessage = messages.some(m => m.role === "user");
  if (!hasUserMessage) {
    return NextResponse.json(
      { error: "At least one user message is required." },
      { status: 400 }
    );
  }

  // Convert the message history into a single text prompt
  const prompt = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  try {
    const response = await llm.models.generateContent({
      model,
      contents: prompt,
    });

    return NextResponse.json({
      assistantMessage: {
        role: "assistant",
        content: response.text ?? "",
      },
    });
  } catch (error) {
    console.error("Gemini API request failed:", error);
    return NextResponse.json(
      { error: "Failed to generate a response." },
      { status: 500 }
    );
  }
}
