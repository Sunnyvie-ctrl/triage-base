import {
  generateTriage,
  InvalidModelOutputError,
  LLM_MODEL,
  type TokenUsage,
} from "../../../lib/llm";

import { logLlmCall } from "../../../lib/llm-logger";
import { PROMPT_VERSION } from "../../../lib/prompt";

const API_NAME = "google_genai_generate_content";

function readPrice(name: string): number | null {
  const raw = process.env[name];

  if (!raw?.trim()) return null;

  const price = Number(raw);

  return Number.isFinite(price) && price >= 0
    ? price
    : null;
}

function estimateCost(
  usage: TokenUsage,
): number | null {
  const inputPrice = readPrice(
    "LLM_INPUT_PRICE_PER_MILLION",
  );

  const outputPrice = readPrice(
    "LLM_OUTPUT_PRICE_PER_MILLION",
  );

  if (
    usage.input_tokens === null ||
    usage.output_tokens === null ||
    usage.thoughts_tokens === null ||
    inputPrice === null ||
    outputPrice === null
  ) {
    return null;
  }

  return (
    usage.input_tokens * inputPrice +
    (usage.output_tokens + usage.thoughts_tokens) *
      outputPrice
  ) / 1_000_000;
}

async function recordCall(
  status: number,
  usage: TokenUsage | null = null,
): Promise<void> {
  const hasUsage =
    usage !== null &&
    (usage.input_tokens !== null ||
      usage.output_tokens !== null ||
      usage.thoughts_tokens !== null ||
      usage.total_tokens !== null);

  try {
    await logLlmCall({
      ts: new Date().toISOString(),
      route: "triage",
      api: API_NAME,
      prompt_version: PROMPT_VERSION,
      model: LLM_MODEL,
      status,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      thoughts_tokens: usage?.thoughts_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      usage_available: hasUsage,
      estimated_cost_usd: usage
        ? estimateCost(usage)
        : null,
    });
  } catch {
    console.error("Could not write the LLM call log.");
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error:
          "Invalid request. Please send a valid JSON body.",
      },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("ticket" in body) ||
    typeof body.ticket !== "string" ||
    !body.ticket.trim()
  ) {
    return Response.json(
      { error: "Please provide a non-empty ticket." },
      { status: 400 },
    );
  }

  try {
    const { triage, usage } = await generateTriage(
      body.ticket,
    );

    await recordCall(200, usage);

    return Response.json(triage, { status: 200 });
  } catch (error) {
    const usage =
      error instanceof InvalidModelOutputError
        ? error.usage
        : null;

    await recordCall(502, usage);

    if (error instanceof InvalidModelOutputError) {
      return Response.json(
        {
          error:
            "The triage response could not be validated. Please try again.",
        },
        { status: 502 },
      );
    }

    console.error("Triage provider or server error.");

    return Response.json(
      {
        error:
          "Triage is temporarily unavailable. Please try again later.",
      },
      { status: 502 },
    );
  }
}
