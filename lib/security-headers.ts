/**
 * Headers sent with every response (wired up in next.config.ts).
 *
 * The content security policy deliberately has no script-src: Next injects
 * inline scripts, and restricting them needs a per-request nonce, which
 * conflicts with cached pages. What it does lock down is framing, plugins,
 * <base> hijacking and forms posting to other sites.
 * Upgrade path: nonce-based script-src once the pages are fully dynamic.
 */
const csp = [
  "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];
