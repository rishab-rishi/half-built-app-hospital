import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evalFixtures } from "../eval/fixtures";
import { prepareDiagnoseInput } from "@/lib/diagnose-input";
import { buildEvidenceMap, describeEvidenceId, validateEvidence } from "@/lib/evidence";
import { applyCautionRules, interpretDiagnosis } from "@/lib/interpret";
import { findUnsafeOutput } from "@/lib/output-checks";
import {
  lookupReference,
  MAX_REFERENCE_ENTRIES,
  PLAYBOOK,
  playbookEntrySchema,
  rankEntries,
  referenceId,
  referencesFor,
  SECTION_KEYS,
} from "@/lib/playbook";
import { diagnoseMessages, REFERENCE_RULES } from "@/lib/prompts";
import { intakeSchema, reportSchema, type Intake, type ModelReport, type Report } from "@/lib/schemas";
import { estimateTokens, MAX_INPUT_TOKENS } from "@/lib/tokens";
import { makeHarness, reportJson, TRIAGE_OK, type Harness } from "./helpers/harness";

const intakeOf = (over: Partial<Intake>): Intake =>
  intakeSchema.parse({
    title: "Untitled problem report",
    purpose: "Understand a problem in the app.",
    stack: ["unknown"],
    working: ["Most pages load"],
    symptoms: "Something is wrong with the app.",
    error: "",
    ...over,
  });
const evidenceOf = (over: Partial<Intake>) => buildEvidenceMap(intakeOf(over));
const topId = (over: Partial<Intake>) => rankEntries(evidenceOf(over))[0]?.entry.id;

describe("playbook data", () => {
  it("has 16 entries that satisfy the schema, with unique ids", () => {
    expect(PLAYBOOK).toHaveLength(16);
    for (const e of PLAYBOOK) {
      const parsed = playbookEntrySchema.safeParse(e);
      expect(parsed.success, `${e.id} ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
    }
    expect(new Set(PLAYBOOK.map((e) => e.id)).size).toBe(PLAYBOOK.length);
  });

  it("passes the same output safety checks the model's reports must pass", () => {
    expect(findUnsafeOutput(PLAYBOOK)).toBeNull();
  });

  it("holds no line breaks, links or code, and the longest id still fits an evidence id", () => {
    for (const e of PLAYBOOK) {
      const strings = [e.title, ...e.stacks, ...e.signals, ...Object.values(e.sections)];
      for (const s of strings) expect(s, e.id).not.toMatch(/[\r\n`<>]|https?:/i);
      for (const k of SECTION_KEYS) expect(referenceId(e.id, k).length, e.id).toBeLessThanOrEqual(64);
    }
  });
});

describe("lookupReference", () => {
  it("resolves a real reference and rejects anything else", () => {
    const entry = PLAYBOOK[0];
    const ref = lookupReference(referenceId(entry.id, "fix"));
    expect(ref?.text).toBe(entry.sections.fix);
    expect(ref?.label).toContain(entry.title);
    expect(lookupReference("kb:no-such-entry#fix")).toBeUndefined();
    expect(lookupReference(`kb:${entry.id}#bogus`)).toBeUndefined();
    expect(lookupReference("symptoms")).toBeUndefined();
    expect(lookupReference("kb:__proto__#fix")).toBeUndefined();
  });

  it("labels reference ids for display", () => {
    expect(describeEvidenceId(referenceId(PLAYBOOK[0].id, "cause"))).toMatch(/^Reference: /);
    expect(describeEvidenceId("kb:gone#cause")).toBe("Reference: unavailable");
  });
});

describe("retrieval", () => {
  it("finds the matching entry for common failures described in the user's own words", () => {
    expect(topId({ title: "Stripe webhooks credit accounts twice", symptoms: "Customers get credited two times when the webhook retries." })).toBe(
      "payment-webhook-processed-twice",
    );
    expect(topId({ title: "Upload returns 413", symptoms: "Files over a few megabytes fail with 413 Payload Too Large.", error: "413 Request Entity Too Large" })).toBe(
      "request-body-too-large",
    );
    expect(topId({ title: "Login loop on Safari", symptoms: "Login works in Chrome but not Safari, third-party cookies seem blocked." })).toBe(
      "browser-specific-login-cookie",
    );
  });

  it("returns nothing for vague or off-topic reports", () => {
    expect(rankEntries(evidenceOf({}))).toEqual([]);
    expect(rankEntries(evidenceOf({ title: "Logo looks blurry", symptoms: "The logo in the header looks blurry on high resolution screens." }))).toEqual([]);
    expect(rankEntries(evidenceOf({ title: "Dark mode colours", symptoms: "The footer text is hard to read in dark mode." }))).toEqual([]);
  });

  it("stays quiet on the deliberately vague evaluation cases", () => {
    for (const id of ["insufficient-01", "insufficient-02"]) {
      const f = evalFixtures.find((x) => x.id === id)!;
      expect(rankEntries(buildEvidenceMap(intakeSchema.parse(f.intake))), id).toEqual([]);
    }
  });

  it("returns at most the allowed number of entries, best first, and is deterministic", () => {
    const ev = evidenceOf({
      title: "Form reload and crash",
      symptoms: "Page reloads on submit and Cannot read properties of undefined on the server when a field is missing.",
      error: "TypeError: Cannot read properties of undefined (reading 'map')",
    });
    const a = rankEntries(ev);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(MAX_REFERENCE_ENTRIES);
    expect(a.map((r) => r.score)).toEqual([...a.map((r) => r.score)].sort((x, y) => y - x));
    expect(rankEntries(ev).map((r) => r.entry.id)).toEqual(a.map((r) => r.entry.id));
  });

  it("builds one reference per section, keyed by reference id", () => {
    const ranked = rankEntries(evidenceOf({ title: "Cron job not running", symptoms: "Scheduled cron job never runs after deploy." }));
    const refs = referencesFor(ranked);
    expect(Object.keys(refs)).toHaveLength(ranked.length * SECTION_KEYS.length);
    for (const [id, text] of Object.entries(refs)) expect(lookupReference(id)?.text).toBe(text);
  });
});

describe("prompt construction", () => {
  const ev = evidenceOf({ title: "Cron job not running", symptoms: "Scheduled cron job never runs after deploy." });

  it("is unchanged when there are no references", () => {
    const m = diagnoseMessages(ev, []);
    expect(m.system).not.toContain("Reference notes");
    expect(m.user).not.toContain("validReferenceIds");
  });

  it("adds the reference rules and ids only when references exist", () => {
    const refs = referencesFor(rankEntries(ev));
    const m = diagnoseMessages(ev, [], refs);
    expect(m.system).toContain(REFERENCE_RULES.trim().slice(0, 40));
    const data = JSON.parse(m.user.slice(m.user.indexOf("{")));
    expect(data.validReferenceIds).toEqual(Object.keys(refs));
    expect(data.validEvidenceIds.some((id: string) => id.startsWith("kb:"))).toBe(false);
  });
});

describe("fitting references under the input cap", () => {
  const ev = evidenceOf({ title: "Cron job not running", symptoms: "Scheduled cron job never runs after deploy." });

  it("includes references when they fit", () => {
    const out = prepareDiagnoseInput(ev, []);
    expect(Object.keys(out.references).length).toBeGreaterThan(0);
    expect(out.inputTokens).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
  });

  it("can be switched off", () => {
    expect(prepareDiagnoseInput(ev, [], { retrieve: false }).references).toEqual({});
  });

  it("drops references to make room, and skips them entirely when there is none", () => {
    const base = prepareDiagnoseInput(ev, [], { retrieve: false }).inputTokens;
    const full = prepareDiagnoseInput(ev, []);
    const roomForSome = prepareDiagnoseInput(ev, [], { maxInputTokens: full.inputTokens - 1 });
    expect(Object.keys(roomForSome.references).length).toBeLessThan(Object.keys(full.references).length);
    expect(roomForSome.inputTokens).toBeLessThanOrEqual(full.inputTokens - 1);
    const none = prepareDiagnoseInput(ev, [], { maxInputTokens: base });
    expect(none.references).toEqual({});
    expect(none.inputTokens).toBe(base);
  });

  it("never turns an acceptable request into an oversized one", () => {
    const long = {
      ...evidenceOf({ title: "Cron job not running", symptoms: "Scheduled cron job never runs after deploy." }),
      "answer:q1": "It has been like this for a while. ".repeat(60),
    };
    const base = prepareDiagnoseInput(long, [], { retrieve: false });
    const withRag = prepareDiagnoseInput(long, []);
    if (base.inputTokens <= MAX_INPUT_TOKENS) expect(withRag.inputTokens).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
    expect(estimateTokens(withRag.messages.system + withRag.messages.user)).toBe(withRag.inputTokens);
  });
});

const modelReport = (over: Partial<ModelReport> = {}): ModelReport =>
  reportSchema.parse(JSON.parse(reportJson(over as Record<string, unknown>)));
const REF = referenceId("scheduled-job-missing-or-late", "cause");
const REFS = { [REF]: lookupReference(REF)!.text };

describe("citing references", () => {
  it("lets hypotheses and tasks cite a retrieved reference but never observations", () => {
    const { report, dropped } = validateEvidence(
      modelReport({
        observations: [
          { text: "Only a reference backs this.", evidenceIds: [REF] },
          { text: "Reported and backed.", evidenceIds: ["symptoms", REF] },
        ],
        hypotheses: [{ text: "h", explanation: "e", evidenceIds: ["symptoms", REF], confidence: "medium", verification: "v" }],
      }),
      buildEvidenceMap(intakeOf({})),
      REFS,
    );
    expect(report.observations).toHaveLength(1);
    expect(report.observations[0].evidenceIds).toEqual(["symptoms"]);
    expect(report.hypotheses[0].evidenceIds).toEqual(["symptoms", REF]);
    // Observation 1: its reference, then the whole observation. Observation 2: its reference.
    expect(dropped).toBe(3);
    expect(report.incomplete).toBe(true);
  });

  it("drops references that were not retrieved for this case or do not exist", () => {
    const other = referenceId("request-body-too-large", "fix");
    const { report, dropped } = validateEvidence(
      modelReport({
        hypotheses: [{ text: "h", explanation: "e", evidenceIds: [other, "kb:made-up#cause"], confidence: "low", verification: "v" }],
      }),
      buildEvidenceMap(intakeOf({})),
      REFS,
    );
    expect(report.hypotheses[0].evidenceIds).toEqual([]);
    expect(dropped).toBe(2);
  });

  it("accepts no references at all when none were supplied", () => {
    const { report } = validateEvidence(
      modelReport({ recoveryTasks: [{ title: "t", priority: "P1", rationale: "r", evidenceIds: [REF], verification: "v", acceptanceCriteria: ["a"] }] }),
      buildEvidenceMap(intakeOf({})),
    );
    expect(report.recoveryTasks[0].evidenceIds).toEqual([]);
  });

  it("does not let a reference raise confidence", () => {
    const base = validateEvidence(
      modelReport({
        hypotheses: [{ text: "h", explanation: "e", evidenceIds: ["symptoms", REF], confidence: "high", verification: "v" }],
      }),
      buildEvidenceMap(intakeOf({})),
      REFS,
    ).report as Report;
    expect(applyCautionRules(base).report.hypotheses[0].confidence).toBe("medium");
    const refOnly = { ...base, hypotheses: [{ ...base.hypotheses[0], evidenceIds: [REF], confidence: "medium" as const }] };
    expect(applyCautionRules(refOnly).report.hypotheses[0].confidence).toBe("low");
  });

  it("interpretDiagnosis threads references through", () => {
    const text = reportJson({
      hypotheses: [{ text: "h", explanation: "e", evidenceIds: ["symptoms", REF], confidence: "medium", verification: "v" }],
    });
    const ev = buildEvidenceMap(intakeOf({}));
    const withRefs = interpretDiagnosis(text, ev, REFS);
    expect(withRefs.ok && withRefs.value.report.hypotheses[0].evidenceIds).toEqual(["symptoms", REF]);
    const without = interpretDiagnosis(text, ev);
    expect(without.ok && without.value.report.hypotheses[0].evidenceIds).toEqual(["symptoms"]);
  });
});

describe("live diagnosis with retrieval", () => {
  let h: Harness;
  beforeEach(async () => {
    h = makeHarness();
    await h.reset();
  });
  afterEach(async () => {
    await h.reset();
  });

  const cronIntake = intakeOf({
    title: "Cron job not running after deploy",
    symptoms: "The scheduled cron job never runs on the deployed site. It ran fine on my laptop.",
  });

  async function run(intake: Intake) {
    h.prov.state.behaviour = async (req) => ({ text: req.stage === "triage" ? TRIAGE_OK : reportJson(), totalTokens: 100 });
    const a = await h.admit();
    const t = await h.triage(a.caseId, a.cookie, { intake });
    const d = await h.diagnose(a.caseId, a.cookie, { questions: t.json.questions, ticket: t.json.ticket }, { intake });
    return d;
  }

  it("sends matching references to the model on diagnosis only, and logs how many", async () => {
    const d = await run(cronIntake);
    expect(d.res.status).toBe(200);
    const [triageCall, diagnoseCall] = h.prov.calls;
    expect(triageCall.messages.user).not.toContain("validReferenceIds");
    expect(diagnoseCall.messages.user).toContain("kb:scheduled-job-missing-or-late#cause");
    expect(diagnoseCall.messages.system).toContain("Reference notes");
    const log = h.logs.find((l) => l.stage === "diagnose" && l.outcome === "ok");
    expect(log?.references).toBeGreaterThan(0);
  });

  it("sends no references for an unrelated report", async () => {
    const d = await run(intakeOf({ title: "Logo looks blurry", symptoms: "The header logo looks blurry on high resolution screens." }));
    expect(d.res.status).toBe(200);
    expect(h.prov.calls[1].messages.user).not.toContain("validReferenceIds");
    expect(h.logs.find((l) => l.stage === "diagnose" && l.outcome === "ok")?.references).toBe(0);
  });

  it("reserves budget for the larger prompt it actually sends", async () => {
    await run(cronIntake);
    const sent = h.prov.calls[1].messages;
    const withRefs = estimateTokens(sent.system + sent.user);
    const plain = prepareDiagnoseInput(buildEvidenceMap(cronIntake), [{ id: "q1", text: "What does the log show when it fails?", why: "It narrows the cause." }], {
      retrieve: false,
    }).inputTokens;
    expect(withRefs).toBeGreaterThan(plain);
    expect(withRefs).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
  });
});
