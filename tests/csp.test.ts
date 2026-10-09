import { describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName } from "@/lib/csp";

describe("content security policy", () => {
  const prod = buildCsp("abc123", { dev: false });
  const directive = (name: string) => prod.split("; ").find((d) => d.startsWith(name + " "));

  it("uses a per-request nonce with strict-dynamic and no eval or inline scripts in production", () => {
    const script = directive("script-src")!;
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("unsafe-eval");
    expect(script).not.toContain("unsafe-inline");
  });

  it("allows Cloudflare only where Turnstile needs it", () => {
    expect(directive("script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive("frame-src")).toBe("frame-src https://challenges.cloudflare.com");
    expect(directive("connect-src")).toBe("connect-src 'self' https://challenges.cloudflare.com");
    expect(directive("img-src")).not.toContain("http");
  });

  it("blocks framing, plugins and base tag hijacking", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });

  it("only loosens eval in development", () => {
    expect(buildCsp("n", { dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp("n", { dev: true })).not.toContain("upgrade-insecure-requests");
  });

  it("is report-only unless enforcement is explicitly switched on", () => {
    expect(cspHeaderName(undefined)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });

  it("uses a different nonce per call site input", () => {
    expect(buildCsp("a", { dev: false })).not.toBe(buildCsp("b", { dev: false }));
  });
});
