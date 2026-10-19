import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type LlmCallLog = {
  ts: string;
  route: string;
  api: string;
  prompt_version: string;
  model: string;
  status: number;
  input_tokens: number | null;
  output_tokens: number | null;
  thoughts_tokens: number | null;
  total_tokens: number | null;
  usage_available: boolean;
  estimated_cost_usd: number | null;
};

const logDirectory = path.join(process.cwd(), "app", "logs");
const logFile = path.join(logDirectory, "llm-calls.jsonl");

export async function logLlmCall(
  entry: LlmCallLog,
): Promise<void> {
  try {
    await mkdir(logDirectory, { recursive: true });

    await appendFile(
      logFile,
      `${JSON.stringify(entry)}\n`,
      {
        encoding: "utf8",
        flag: "a",
      },
    );
  } catch {
    console.error("Could not write the LLM call log.");
    throw new Error("LLM logging failed.");
  }
}
