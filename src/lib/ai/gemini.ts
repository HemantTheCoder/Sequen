import "server-only";
import { GoogleGenAI, Type, type Schema } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local to enable AI features.",
    );
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const MODEL = "gemini-2.5-flash";

/** Calls Gemini and parses its response as JSON conforming to `schema`. */
export async function generateStructured<T>(
  prompt: string,
  schema: Schema,
): Promise<T> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned an empty response");
  return JSON.parse(text) as T;
}

export { Type };
