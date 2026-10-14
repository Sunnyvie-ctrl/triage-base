import "server-only"
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.LLM_API_KEY;
export const model = process.env.LLM_MODEL ?? "gemini-2.5-flash";;

if (!apiKey) {
  throw new Error("Missing LLM_API_KEY");
}

if (!model) {
  throw new Error("Missing LLM_MODEL");
}

export const llm = new GoogleGenAI({
    apiKey
});