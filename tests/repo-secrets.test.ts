import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findLikelySecret } from "@/lib/secrets";

// Files that intentionally contain fake, documented example credentials (detector tests and evaluation fixtures).
const ALLOWED_FAKES = [/^tests\//, /^eval\/fixtures\.ts$/];
const SKIP = [/package-lock\.json$/, /\.(ico|png|jpg|jpeg|gif|webp|woff2?)$/];

function trackedFiles(): string[] | null {
  try {
    return execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    return null; // not a git checkout (e.g. a source archive)
  }
}

describe("repository hygiene", () => {
  const files = trackedFiles();

  it.skipIf(files === null)("no tracked file contains credential-like text outside the intended fixtures", () => {
    const hits: string[] = [];
    for (const f of files!) {
      if (SKIP.some((r) => r.test(f)) || ALLOWED_FAKES.some((r) => r.test(f))) continue;
      if (statSync(f).size > 1_000_000) continue;
      const hit = findLikelySecret(readFileSync(f, "utf8"));
      if (hit) hits.push(`${f}: ${hit}`);
    }
    expect(hits).toEqual([]);
  });

  it.skipIf(files === null)("no environment file other than the example is tracked", () => {
    const env = files!.filter((f) => /(^|\/)\.env/.test(f));
    expect(env).toEqual([".env.example"]);
  });

  it.skipIf(files === null)(".env.example holds placeholders only", () => {
    const lines = readFileSync(".env.example", "utf8").split(/\r?\n/).filter((l) => l.includes("="));
    for (const l of lines) {
      const value = l.slice(l.indexOf("=") + 1).trim();
      expect(findLikelySecret(l), l).toBeNull();
      expect(value.length, l).toBeLessThan(60);
    }
  });
});
