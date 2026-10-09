// Sized so a worst-case call (input + output cap) fits inside the provider's per-minute token limit.
export const MAX_INPUT_TOKENS = 5000;
export const MAX_OUTPUT_TOKENS = { triage: 450, diagnose: 1800 } as const;

/**
 * Conservative upper estimate without a tokenizer: UTF-8 bytes / 3, plus a 20% margin.
 * Character limits alone are not token limits (non-Latin scripts cost more per character).
 */
export function estimateTokens(text: string): number {
  const bytes = new TextEncoder().encode(text).length;
  return Math.ceil((bytes / 3) * 1.2);
}
