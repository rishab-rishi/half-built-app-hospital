import { z } from "zod";
import entries from "@/data/playbook/entries.json";
import type { EvidenceMap } from "./evidence";

/**
 * Curated failure-pattern reference material. Retrieval is deterministic keyword scoring over a small shipped file:
 * no embedding provider, no vector store, and no user text leaves the server. Each section of an entry becomes one
 * citable reference ID, "kb:<entry>#<section>". References are leads to check, never facts about the user's app.
 */

export const SECTION_KEYS = ["cause", "confirm", "fix", "notWhen"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABELS: Record<SectionKey, string> = {
  cause: "likely cause",
  confirm: "how to confirm",
  fix: "direction of the fix",
  notWhen: "when it may not apply",
};

const str = (min: number, max: number) => z.string().min(min).max(max);

export const playbookEntrySchema = z.strictObject({
  id: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: str(10, 100),
  stacks: z.array(str(1, 40)).min(1).max(6),
  signals: z.array(str(3, 80)).min(3).max(8),
  sections: z.strictObject({
    cause: str(120, 400),
    confirm: str(120, 400),
    fix: str(120, 400),
    notWhen: str(80, 300),
  }),
});
export type PlaybookEntry = z.infer<typeof playbookEntrySchema>;

/** Shape and limits are enforced by tests/playbook.test.ts, not at import time. */
export const PLAYBOOK: readonly PlaybookEntry[] = entries;

export const referenceId = (entryId: string, section: SectionKey) => `kb:${entryId}#${section}`;

const byId = new Map(PLAYBOOK.map((e) => [e.id, e]));

export type Reference = { entryId: string; title: string; section: SectionKey; label: string; text: string };

/** Resolve a reference ID against the shipped playbook. Returns undefined for anything unknown or malformed. */
export function lookupReference(id: string): Reference | undefined {
  const m = /^kb:([a-z0-9-]+)#([A-Za-z]+)$/.exec(id);
  if (!m) return undefined;
  const entry = byId.get(m[1]);
  const section = SECTION_KEYS.find((k) => k === m[2]);
  if (!entry || !section) return undefined;
  return {
    entryId: entry.id,
    title: entry.title,
    section,
    label: `${entry.title} (${SECTION_LABELS[section]})`,
    text: entry.sections[section],
  };
}

/* ---------- Retrieval ---------- */

const STOP = new Set(
  "the and for are but not you all can had her was one our out has have been this that with from they will would there their what about which when your into than then them these some could other only over also just very more most make like such after before while where does did its use used using get got say said app application code".split(
    " ",
  ),
);

/** Lowercase word tokens with a crude suffix strip, so "uploads" and "upload" meet. Short words are dropped. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let t = raw;
    if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
    else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
    else if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
    if (t.length >= 3 && !STOP.has(t)) out.push(t);
  }
  return out;
}

const normalise = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");

type Indexed = { entry: PlaybookEntry; tf: Map<string, number>; length: number; phrases: string[] };

function buildIndex(list: readonly PlaybookEntry[]): { docs: Indexed[]; df: Map<string, number>; avgLength: number } {
  const df = new Map<string, number>();
  const docs = list.map((entry) => {
    const tf = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + weight);
    };
    add(entry.title, 2);
    entry.signals.forEach((s) => add(s, 3));
    entry.stacks.forEach((s) => add(s, 2));
    SECTION_KEYS.forEach((k) => add(entry.sections[k], 1));
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    let length = 0;
    for (const n of tf.values()) length += n;
    return { entry, tf, length, phrases: entry.signals.map(normalise).filter((p) => p.length >= 3) };
  });
  const avgLength = docs.reduce((n, d) => n + d.length, 0) / Math.max(1, docs.length);
  return { docs, df, avgLength };
}

const INDEX = buildIndex(PLAYBOOK);

const K1 = 1.2;
const B = 0.75;
/** An exact signal phrase in the user's text is the strongest cue: users paste the very error they see. */
const PHRASE_BONUS = 3;
const MAX_PHRASE_HITS = 3;

/** Below this score nothing is returned: a vague or off-topic case gets no references. */
export const MIN_SCORE = 12;
/** The runner-up must reach this share of the best score, so unrelated second entries are not padded in. */
const RUNNER_UP_RATIO = 0.85;
export const MAX_REFERENCE_ENTRIES = 2;

export type RankedEntry = { entry: PlaybookEntry; score: number };

export function scoreEntries(evidence: EvidenceMap, index = INDEX): RankedEntry[] {
  const text = Object.values(evidence).join("\n");
  const query = new Set(tokenize(text));
  const haystack = ` ${normalise(text)} `;
  const n = index.docs.length;
  return index.docs
    .map((d) => {
      let score = 0;
      for (const term of query) {
        const tf = d.tf.get(term);
        if (!tf) continue;
        const df = index.df.get(term) ?? 1;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * d.length) / index.avgLength));
      }
      const hits = d.phrases.filter((p) => haystack.includes(` ${p} `)).length;
      score += PHRASE_BONUS * Math.min(hits, MAX_PHRASE_HITS);
      return { entry: d.entry, score };
    })
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
}

/** The playbook entries worth showing the model for this case, best first. May be empty. */
export function rankEntries(evidence: EvidenceMap): RankedEntry[] {
  const scored = scoreEntries(evidence);
  const best = scored[0];
  if (!best || best.score < MIN_SCORE) return [];
  return scored
    .filter((r, i) => i === 0 || (r.score >= MIN_SCORE && r.score >= best.score * RUNNER_UP_RATIO))
    .slice(0, MAX_REFERENCE_ENTRIES);
}

/** Reference ID -> text for the given entries. Same shape as the user evidence map, kept separate from it. */
export function referencesFor(ranked: readonly RankedEntry[]): EvidenceMap {
  const map: EvidenceMap = Object.create(null);
  for (const { entry } of ranked) for (const k of SECTION_KEYS) map[referenceId(entry.id, k)] = entry.sections[k];
  return map;
}
