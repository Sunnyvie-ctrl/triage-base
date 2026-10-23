import "server-only";

import { GoogleGenAI } from "@google/genai";
import { TriageSchema, type TriageResult } from "./schema";
import { SYSTEM_MESSAGE, EXPLAIN_SYSTEM_PROMPT, wrapTicket, wrapExplainPrompt } from "./prompt";

const apiKey = process.env.LLM_API_KEY;

export const LLM_MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";

const mode = process.env.LLM_STRUCTURED_OUTPUT ?? "prompt";

if (!apiKey) {
  throw new Error("Missing LLM_API_KEY environment variable");
}

if (mode !== "prompt") {
  throw new Error("Unsupported structured output mode");
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

const client = new GoogleGenAI({
  apiKey,
  httpOptions: {
    timeout: REQUEST_TIMEOUT_MS,
  },
});

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    status?: number;
    message?: string;
    code?: string;
  };

  if (candidate.status === 429) {
    return false;
  }

  if ([500, 502, 503, 504].includes(candidate.status ?? 0)) {
    return true;
  }

  const message = `${candidate.code ?? ""} ${candidate.message ?? ""}`;

  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|socket hang up/i.test(
    message,
  );
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export type TokenUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  thoughts_tokens: number | null;
  total_tokens: number | null;
};

export class InvalidModelOutputError extends Error {
  usage: TokenUsage;

  constructor(usage: TokenUsage) {
    super("The model returned an invalid triage response.");
    this.name = "InvalidModelOutputError";
    this.usage = usage;
  }
}

export async function generateTriage(
  ticket: string,
): Promise<{ triage: TriageResult; usage: TokenUsage }> {
  const result = await withRetry(() =>
    client.models.generateContent({
      model: LLM_MODEL,
      contents: wrapTicket(ticket),
      config: {
        systemInstruction: SYSTEM_MESSAGE,
      },
    }),
  );

  const metadata = result.usageMetadata;

  const usage: TokenUsage = {
    input_tokens: metadata?.promptTokenCount ?? null,
    output_tokens: metadata?.candidatesTokenCount ?? null,
    thoughts_tokens: metadata?.thoughtsTokenCount ?? null,
    total_tokens: metadata?.totalTokenCount ?? null,
  };

  const output = result.text;

  if (!output) {
    throw new InvalidModelOutputError(usage);
  }

  const cleaned = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new InvalidModelOutputError(usage);
  }

  const checked = TriageSchema.safeParse(parsed);

  if (!checked.success) {
    throw new InvalidModelOutputError(usage);
  }

  return {
    triage: checked.data,
    usage,
  };
}

export async function generatePlainText(
  systemInstruction: string,
  message: string,
): Promise<string> {
  const result = await withRetry(() =>
    client.models.generateContent({
      model: LLM_MODEL,
      contents: message,
      config: {
        systemInstruction,
      },
    }),
  );

  const reply = result.text;

  if (!reply) {
    throw new Error("The model returned an empty response.");
  }

  return reply;
}

export async function generateExplanationStream(
  ticket: string,
  triage: TriageResult,
) {
  return client.models.generateContentStream({
    model: LLM_MODEL,
    contents: wrapExplainPrompt(ticket, triage),
    config: {
      systemInstruction: EXPLAIN_SYSTEM_PROMPT,
    },
  });
}