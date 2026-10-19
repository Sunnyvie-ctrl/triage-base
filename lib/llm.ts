import "server-only";

import { GoogleGenAI } from "@google/genai";
import { TriageSchema, type TriageResult } from "./schema";
import { SYSTEM_MESSAGE, wrapTicket } from "./prompt";

const apiKey = process.env.LLM_API_KEY;

export const LLM_MODEL =
  process.env.LLM_MODEL ?? "gemini-2.5-flash";

const mode = process.env.LLM_STRUCTURED_OUTPUT ?? "prompt";

if (!apiKey) {
  throw new Error("Missing LLM_API_KEY environment variable");
}

if (mode !== "prompt") {
  throw new Error("Unsupported structured output mode");
}

const client = new GoogleGenAI({ apiKey });

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
  const result = await client.models.generateContent({
    model: LLM_MODEL,
    contents: wrapTicket(ticket),
    config: {
      systemInstruction: SYSTEM_MESSAGE,
    },
  });

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
  const result = await client.models.generateContent({
    model: LLM_MODEL,
    contents: message,
    config: {
      systemInstruction,
    },
  });

  const reply = result.text;

  if (!reply) {
    throw new Error("The model returned an empty response.");
  }

  return reply;
}
