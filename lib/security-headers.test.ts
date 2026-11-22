import { describe, expect, it } from "vitest";

import { securityHeaders } from "@/lib/security-headers";

const get = (key: string) =>
  securityHeaders.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe("securityHeaders", () => {
  it("blocks framing, sniffing and leaking the referrer", () => {
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("forces https for a year including subdomains", () => {
    expect(get("Strict-Transport-Security")).toMatch(
      /max-age=31536000; includeSubDomains/,
    );
  });

  it("turns off device features the app never uses", () => {
    expect(get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(), payment=()",
    );
  });

  it("sets a content security policy that stops framing, plugins and foreign forms", () => {
    const csp = get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("has no duplicate header names", () => {
    const keys = securityHeaders.map((h) => h.key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
