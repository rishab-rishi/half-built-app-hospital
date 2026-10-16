import type { EvidenceMap } from "./evidence";
import { rankEntries, referencesFor, type RankedEntry } from "./playbook";
import { diagnoseMessages, type ChatMessages } from "./prompts";
import type { Question } from "./schemas";
import { estimateTokens, MAX_INPUT_TOKENS } from "./tokens";

export type DiagnoseInput = {
  messages: ChatMessages;
  inputTokens: number;
  /** Reference ID -> text actually placed in the prompt. Empty when nothing matched or nothing fit. */
  references: EvidenceMap;
};

/**
 * Build the diagnosis prompt with as many matching playbook entries as fit under the input cap.
 * The user's own text always has priority: entries are dropped, lowest-ranked first, until the prompt fits, and
 * retrieval is skipped entirely if it fails. A request that was acceptable without references stays acceptable.
 * If the prompt is over the cap even with no references, the caller sees that in `inputTokens` and refuses it.
 */
export function prepareDiagnoseInput(
  evidence: EvidenceMap,
  questions: Question[],
  options: { maxInputTokens?: number; retrieve?: boolean } = {},
): DiagnoseInput {
  const { maxInputTokens = MAX_INPUT_TOKENS, retrieve = true } = options;
  let ranked: RankedEntry[] = [];
  if (retrieve) {
    try {
      ranked = rankEntries(evidence);
    } catch {
      ranked = [];
    }
  }
  for (;;) {
    const references = referencesFor(ranked);
    const messages = diagnoseMessages(evidence, questions, references);
    const inputTokens = estimateTokens(messages.system + messages.user);
    if (inputTokens <= maxInputTokens || ranked.length === 0) return { messages, inputTokens, references };
    ranked = ranked.slice(0, -1);
  }
}
