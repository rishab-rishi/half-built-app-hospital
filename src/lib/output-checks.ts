const CHECKS: { label: string; re: RegExp }[] = [
  {
    label: "requests a secret",
    re: /\b(?:send|paste|share|provide|give|post|upload|email)\b[^.\n]{0,25}\b(?:your|the)\s+(?:password|passwords|passphrase|api[ _-]?keys?|private keys?|secret keys?|access tokens?|credentials|\.env(?: file)?|connection string)/i,
  },
  {
    label: "claims an inspection or scan",
    re: /\b(?:we|i)\s+(?:have\s+)?(?:scanned|inspected|audited|ran|executed|tested|reviewed your (?:code|repository|repo))\b|scan[- ]verified|verified by (?:a )?scan|scan results? (?:show|confirm)/i,
  },
  {
    label: "certifies or guarantees",
    re: /\b(?:certified (?:secure|safe)|guaranteed (?:fix|secure|safe)|safe to deploy|ready for production|production[- ]ready|no vulnerabilities)\b/i,
  },
  {
    label: "destructive or unsafe recommendation",
    re: /\brm\s+-rf\b|\bdrop\s+(?:table|database)\b|\btruncate\s+table\b|\bdelete\s+from\b|chmod\s+(?:-R\s+)?777|\|\s*(?:sh|bash)\b|disable (?:authentication|authorization|csrf|ssl|tls|certificate)|--no-verify|force[- ]push/i,
  },
  { label: "link or markup", re: /https?:\/\/|<\s*\/?\s*[a-z][^>]*>|javascript:|data:text/i },
];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** Heuristic backstop. Returns a label for the first violation, or null. Pattern checks are imperfect. */
export function findUnsafeOutput(value: unknown): string | null {
  for (const s of strings(value)) for (const c of CHECKS) if (c.re.test(s)) return c.label;
  return null;
}
