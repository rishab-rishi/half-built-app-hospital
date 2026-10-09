/**
 * Content Security Policy for pages. Scripts need a per-request nonce plus 'strict-dynamic', so the only
 * scripts that run are Next's own and the ones they load (Turnstile). Styles allow inline because Next and
 * Tailwind emit inline styles; that is a much smaller risk than inline scripts. No 'unsafe-eval' in production.
 */
export function buildCsp(nonce: string, opts: { dev: boolean }): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(opts.dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/** Report-only until a private preview has been checked; set CSP_MODE=enforce to switch. */
export function cspHeaderName(mode: string | undefined): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}
