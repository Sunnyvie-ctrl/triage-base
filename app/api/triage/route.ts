import {
  generateTriage,
  InvalidModelOutputError,
  LLM_MODEL,
  type TokenUsage,
} from "../../../lib/llm";
import { generateDecision } from "../../../lib/dm";
import { logLlmCall } from "../../../lib/llm-logger";
import { PROMPT_VERSION } from "../../../lib/prompt";

const API_NAME = "google_genai_generate_content";
const MAX_TICKET_LENGTH = 5000;

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "x-llm-prompt-version": PROMPT_VERSION,
      ...extraHeaders,
    },
  });
}

function readPrice(name: string): number | null {
  const raw = process.env[name];
  if (!raw?.trim()) return null;
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function estimateCost(usage: TokenUsage): number | null {
  const inputPrice = readPrice("LLM_INPUT_PRICE_PER_MILLION");
  const outputPrice = readPrice("LLM_OUTPUT_PRICE_PER_MILLION");

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
    (usage.output_tokens + usage.thoughts_tokens) * outputPrice
  ) / 1_000_000;
}

function usageHeaders(usage: TokenUsage | null): Record<string, string> {
  if (!usage) return {};

  const headers: Record<string, string> = {};
  const values = {
    "x-llm-input-tokens": usage.input_tokens,
    "x-llm-output-tokens": usage.output_tokens,
    "x-llm-thoughts-tokens": usage.thoughts_tokens,
    "x-llm-total-tokens": usage.total_tokens,
  };

  for (const [name, value] of Object.entries(values)) {
    if (value !== null) {
      headers[name] = String(value);
    }
  }

  const cost = estimateCost(usage);
  if (cost !== null) {
    headers["x-llm-estimated-cost-usd"] = String(cost);
  }

  return headers;
}

async function recordCall(
  status: number,
  usage: TokenUsage | null = null,
  modelName: string = LLM_MODEL,
  apiName: string = API_NAME
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
      api: apiName,
      prompt_version: PROMPT_VERSION,
      model: modelName,
      status,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      thoughts_tokens: usage?.thoughts_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      usage_available: hasUsage,
      estimated_cost_usd: usage ? estimateCost(usage) : null,
    });
  } catch {
    console.error("Could not write the LLM call log.");
  }
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|quota|rate.?limit|429/i.test(message);
}

export async function POST(request: Request) {
  let body: any;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: "Invalid request. Please send a valid JSON body." },
      400,
    );
  }

  const { ticket, strategy = "llm" } = body;

  if (!ticket || typeof ticket !== "string" || !ticket.trim()) {
    return jsonResponse({ error: "Please provide a non-empty ticket." }, 400);
  }

  if (ticket.length > MAX_TICKET_LENGTH) {
    return jsonResponse(
      { error: `Ticket is too long. The maximum length is ${MAX_TICKET_LENGTH} characters.` },
      400,
    );
  }

  let currentModel = LLM_MODEL;
  let currentApi = API_NAME;
  let usageForError: TokenUsage | null = null;

  try {
    let finalTriage;
    let finalUsage: TokenUsage;

    if (strategy === "dm") {
      const dmResult = await generateDecision(ticket);
      finalTriage = {
        category: dmResult.category,
        priority: dmResult.priority,
        summary: "N/A - Decision Model Only",
        suggested_action: "N/A - Decision Model Only"
      };
      finalUsage = dmResult.usage;
      currentModel = "typesafe/jev-1.14";
      currentApi = "openrouter_decisions";

    } else if (strategy === "dm+llm") {
      const dmResult = await generateDecision(ticket);
      const augmentedTicket = `[PRE-CLASSIFIED: Category=${dmResult.category}, Priority=${dmResult.priority}]\n\n${ticket}`;
      const llmResult = await generateTriage(augmentedTicket);
      
      finalTriage = {
        category: dmResult.category,
        priority: dmResult.priority,
        summary: llmResult.triage.summary,
        suggested_action: llmResult.triage.suggested_action
      };
      
      finalUsage = {
        input_tokens: (dmResult.usage.input_tokens || 0) + (llmResult.usage.input_tokens || 0),
        output_tokens: (dmResult.usage.output_tokens || 0) + (llmResult.usage.output_tokens || 0),
        thoughts_tokens: llmResult.usage.thoughts_tokens || 0,
        total_tokens: (dmResult.usage.total_tokens || 0) + (llmResult.usage.total_tokens || 0)
      };
      currentModel = `jev-1.14 + ${LLM_MODEL}`;
      currentApi = "pipeline_dm_llm";

    } else {
      const result = await generateTriage(ticket);
      finalTriage = result.triage;
      finalUsage = result.usage;
    }

    usageForError = finalUsage;
    await recordCall(200, finalUsage, currentModel, currentApi);

    const headers = usageHeaders(finalUsage);
    headers["x-llm-model"] = currentModel;

    return jsonResponse(finalTriage, 200, headers);

  } catch (error) {
    if (error instanceof InvalidModelOutputError) {
      usageForError = error.usage;
    }

    if (error instanceof InvalidModelOutputError) {
      await recordCall(502, usageForError, currentModel, currentApi);
      console.error("Model returned invalid output.");
      return jsonResponse({ error: "The response could not be validated. Please try again." }, 502);
    }

    if (isQuotaOrRateLimitError(error)) {
      await recordCall(429, null, currentModel, currentApi);
      console.error("Provider quota or rate limit reached.");
      return jsonResponse(
        { error: "The AI service quota or rate limit has been reached. Please try again later." },
        429,
        { "Retry-After": "60" },
      );
    }

    await recordCall(502, null, currentModel, currentApi);
    console.error(
      "Provider or server error:",
      error instanceof Error ? { name: error.name, message: error.message } : String(error),
    );

    return jsonResponse(
      { error: "Triage is temporarily unavailable. Please try again later." },
      502,
    );
  }
}