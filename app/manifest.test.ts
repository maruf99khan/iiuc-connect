import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "./manifest";

const m = manifest();

describe("web app manifest", () => {
  it("names the app and starts inside it", () => {
    expect(m.name).toBe("IIUC Connect");
    expect(m.short_name && m.short_name.length).toBeLessThanOrEqual(12);
    expect(m.start_url).toBe("/dashboard");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("uses the same theme colour as the page", () => {
    expect(m.theme_color).toBe("#0f5132");
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("offers 192 and 512 pixel icons and a maskable one", () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("points every icon at a file that exists", () => {
    for (const icon of m.icons ?? []) {
      expect(icon.type).toBe("image/png");
      expect(existsSync(path.join(process.cwd(), "public", icon.src))).toBe(true);
    }
  });
});
