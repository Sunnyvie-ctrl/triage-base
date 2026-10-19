
import { NextResponse } from "next/server";
import { generatePlainText } from "../../../lib/llm";

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    const reply = await generatePlainText(
      "You are a helpful assistant. Answer the user's message clearly and concisely.",
      message,
    );

    return new Response(reply, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error(
      "Chat failed:",
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      { error: "Failed to process the chat message." },
      { status: 500 },
    );
  }
}
