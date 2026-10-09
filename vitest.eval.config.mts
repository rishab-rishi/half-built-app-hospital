import { defineConfig } from "vitest/config";
import path from "node:path";

// Intentional, quota-spending evaluation run. Never part of the normal test suite or CI.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["eval/run.eval.ts"], environment: "node", testTimeout: 30 * 60_000 },
});
