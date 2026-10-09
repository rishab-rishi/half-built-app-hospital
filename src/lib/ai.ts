import "server-only";
import Groq from "groq-sdk";
import type { ChatMessages } from "./prompts";

export type ProviderRequest = {
  stage: "triage" | "diagnose";
  messages: ChatMessages;
  maxOutputTokens: number;
  signal: AbortSignal;
};
export type ProviderResult = { text: string; totalTokens?: number };

/** One attempt, no retries, no fallback model. Throws on any failure. */
export interface ModelProvider {
  complete(req: ProviderRequest): Promise<ProviderResult>;
}

export function groqProvider(apiKey: string, model: string): ModelProvider {
  const client = new Groq({ apiKey, maxRetries: 0, timeout: 25_000 });
  return {
    async complete(req) {
      const res = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: "system", content: req.messages.system },
            { role: "user", content: req.messages.user },
          ],
          max_completion_tokens: req.maxOutputTokens,
          temperature: 0,
          response_format: { type: "json_object" },
          // Reasoning tokens count against the output cap; measured 245 of 1711 at default effort.
          ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" as const } : {}),
        },
        { signal: req.signal, maxRetries: 0 },
      );
      const text = res.choices[0]?.message?.content;
      if (typeof text !== "string") throw new Error("empty completion");
      return { text, totalTokens: res.usage?.total_tokens };
    },
  };
}
