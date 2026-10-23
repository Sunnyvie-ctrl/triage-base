import { generateExplanationStream, LLM_MODEL } from "../../../../lib/llm";
import { PROMPT_VERSION } from "../../../../lib/prompt";

const MAX_TICKET_LENGTH = 5000;

export async function POST(request: Request) {
  let body: { ticket?: string; triage?: any };

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const { ticket, triage } = body;

  if (!ticket || typeof ticket !== "string" || !ticket.trim() || !triage) {
    return Response.json(
      { error: "Missing required fields: ticket and triage." },
      { status: 400 }
    );
  }

  if (ticket.length > MAX_TICKET_LENGTH) {
    return Response.json(
      { error: "Ticket exceeds 5,000 character limit." },
      { status: 400 }
    );
  }

  try {
    const responseStream = await generateExplanationStream(ticket, triage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of responseStream) {
          if (chunk.text) {
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-llm-model": LLM_MODEL,
        "x-llm-prompt-version": PROMPT_VERSION,
      },
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to generate explanation stream." },
      { status: 502 }
    );
  }
}