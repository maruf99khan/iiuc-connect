import { describe, expect, it } from "vitest";

import { avatarTint, initials } from "@/lib/ui/avatar";

describe("initials", () => {
  it.each([
    ["Rahim Chowdhury", "RC"],
    ["  nusrat   jahan ", "NJ"],
    ["Madonna", "M"],
    ["Md. Minhajul Alam", "MA"],
    ["মারুফ খান", "মখ"],
    ["", "?"],
    ["   ", "?"],
  ])("%j gives %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("avatarTint", () => {
  it("is stable for the same id", () => {
    const id = "f9000000-0000-4000-8000-000000000001";
    expect(avatarTint(id)).toBe(avatarTint(id));
  });

  it("stays within 0 to 5 and uses more than one tint", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const t = avatarTint(`id-${i}-${i * 7919}`);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(5);
      seen.add(t);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("handles an empty id", () => {
    expect(avatarTint("")).toBeGreaterThanOrEqual(0);
  });
});
