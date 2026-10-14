import { error } from "console";
import { llm, model } from "../../../lib/llm"

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body) ||
    typeof body.message !== "string" ||
    !body.message.trim()
  ) {
    return Response.json(
      { error: "Please provide a non-empty message string." },
      { status: 400 },
    );
  }

  try {
    const response = await llm.models.generateContent({
      model,
      contents: body.message,
    });

    return Response.json({
      answer: response.text ?? "",
    });
  } catch (error) {
    console.error(
      "Gemini API request failed:",
      error instanceof Error ? error.message : String(error),
    );

    return Response.json(
      { error: "Failed to generate a response." },
      { status: 500 },
    );
  }
}
