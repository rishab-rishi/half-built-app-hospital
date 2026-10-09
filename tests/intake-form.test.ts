import { describe, expect, it } from "vitest";
import { EMPTY_FORM, parseForm, splitList } from "@/lib/intake-form";

const valid = {
  ...EMPTY_FORM,
  title: "Booking app",
  purpose: "Reserve slots",
  stackText: "Next.js, Postgres\nRedis",
  workingText: "Login\nSearch",
  symptoms: "Double bookings",
};

describe("intake form parsing", () => {
  it("builds a valid intake from plain text", () => {
    const r = parseForm({ ...valid, error: "line1\r\nline2" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.intake.stack).toEqual(["Next.js", "Postgres", "Redis"]);
      expect(r.intake.working).toEqual(["Login", "Search"]);
      expect(r.intake.error).toBe("line1\nline2");
    }
  });

  it("requires title, purpose and symptoms", () => {
    const r = parseForm(EMPTY_FORM);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["purpose", "symptoms", "title"]);
  });

  it("maps list limits to the right field", () => {
    const r = parseForm({ ...valid, stackText: Array.from({ length: 13 }, (_, i) => `s${i}`).join(",") });
    expect(!r.ok && r.errors.stackText).toMatch(/at most 12/);
    const w = parseForm({ ...valid, workingText: Array.from({ length: 9 }, (_, i) => `w${i}`).join("\n") });
    expect(!w.ok && w.errors.workingText).toMatch(/at most 8/);
  });

  it("flags the aggregate limit separately", () => {
    const r = parseForm({
      ...valid,
      purpose: "p".repeat(1500),
      symptoms: "s".repeat(1500),
      error: "e".repeat(2000),
      workingText: Array.from({ length: 8 }, () => "w".repeat(200)).join("\n"),
    });
    expect(!r.ok && r.errors.total).toMatch(/6,000/);
  });

  it("treats script-like text as plain data", () => {
    const r = parseForm({ ...valid, title: "<script>alert(1)</script>" });
    expect(r.ok && r.intake.title).toBe("<script>alert(1)</script>");
  });

  it("splitList drops blanks", () => {
    expect(splitList(" a , ,b,, ", /[,\n]/)).toEqual(["a", "b"]);
  });
});
