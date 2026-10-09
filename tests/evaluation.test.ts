import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluationSchema, evaluationView, type Evaluation } from "@/lib/evaluation";

const complete: Evaluation = {
  status: "complete",
  date: "2026-10-09",
  casesEvaluated: 18,
  modelId: "m",
  promptVersion: "p1",
  fixtureRevision: "f1",
  providerRetries: 0,
  checks: [{ name: "x", passed: 15, total: 16, failedCases: ["clear-01"] }],
  limitations: ["one run per case"],
};

describe("published evaluation data", () => {
  it("the committed file is valid, and never claims more than was evaluated", () => {
    const e = evaluationSchema.parse(JSON.parse(readFileSync("src/data/evaluation-summary.json", "utf8")));
    if (e.status === "complete") {
      for (const c of e.checks) {
        expect(c.passed).toBeLessThanOrEqual(c.total);
        expect(c.total).toBeLessThanOrEqual(e.casesEvaluated);
        expect(c.failedCases.length).toBe(c.total - c.passed);
      }
    }
  });

  it("rejects extra or invented fields", () => {
    expect(evaluationSchema.safeParse({ status: "pending", accuracy: 0.99 }).success).toBe(false);
    expect(evaluationSchema.safeParse({ ...complete, accuracy: 0.99 }).success).toBe(false);
  });

  it("marks results stale when the prompt or fixtures changed", () => {
    expect(evaluationView({ status: "pending" }, "p1", "f1").kind).toBe("pending");
    expect(evaluationView(complete, "p1", "f1").kind).toBe("current");
    expect(evaluationView(complete, "p2", "f1").kind).toBe("stale");
    expect(evaluationView(complete, "p1", "f2").kind).toBe("stale");
  });
});
