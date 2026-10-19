import "server-only";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.LLM_API_KEY;

export const model =
  process.env.LLM_MODEL ?? "gemini-2.5-flash";

if (!apiKey) {
  throw new Error("Missing LLM_API_KEY environment variable");
}

const client = new GoogleGenAI({ apiKey });

export async function generatePlainText(
  systemMessage: string,
  userMessage: string,
): Promise<string> {
  const result = await client.models.generateContent({
    model,
    contents: userMessage,
    config: {
      systemInstruction: systemMessage,
    },
  });

  return result.text ?? "";
}
