const PATTERNS: { label: string; re: RegExp }[] = [
  { label: "private key block", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { label: "AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { label: "GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/ },
  { label: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { label: "Stripe key", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { label: "API key", re: /\b(?:sk|gsk)[-_][A-Za-z0-9_-]{20,}/ },
  { label: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "JSON web token", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { label: "bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/ },
  { label: "database URL with password", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{3,}@/i },
  {
    label: "assigned credential",
    re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9/+_.-]{12,}/i,
  },
];

/** Returns a label for the first likely credential, never the matched text. Detection is incomplete. */
export function findLikelySecret(text: string): string | null {
  for (const p of PATTERNS) if (p.re.test(text)) return p.label;
  return null;
}
