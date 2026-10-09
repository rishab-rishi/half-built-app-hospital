// Runs the gate and budget suites against the real Upstash database from .env.local.
// Each harness uses a unique key namespace and deletes it afterwards.
import { spawnSync } from "node:child_process";
import path from "node:path";

const vitest = path.resolve("node_modules/vitest/vitest.mjs");
const r = spawnSync(
  process.execPath,
  ["--env-file=.env.local", vitest, "run", "tests/guards.test.ts", "tests/budgets.test.ts"],
  { stdio: "inherit", env: { ...process.env, REAL_REDIS_TESTS: "1" } },
);
process.exit(r.status ?? 1);
