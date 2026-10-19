
import {
  PROMPT_VERSION,
  SYSTEM_MESSAGE,
  wrapTicket,
} from "../../../lib/prompt";

import { generatePlainText } from "../../../lib/llm";

export async function POST(request: Request) {
  try {
    const { ticket } = await request.json();

    console.info(`Using prompt: ${PROMPT_VERSION}`);

    const answer = await generatePlainText(
      SYSTEM_MESSAGE,
      wrapTicket(ticket),
    );

    return new Response(answer, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    console.error(
      "Triage failed:",
      error instanceof Error ? error.message : String(error),
    );

    return new Response("Failed to process the ticket.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
