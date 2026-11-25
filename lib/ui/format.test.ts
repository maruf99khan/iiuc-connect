import { describe, expect, it } from "vitest";

import { relativeTime } from "@/lib/ui/format";

const NOW = new Date("2026-11-25T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("relativeTime", () => {
  it("says now for the last minute", () => {
    expect(relativeTime(ago(30_000), NOW)).toBe("now");
  });

  it("uses minutes, hours and days", () => {
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe("5 minutes ago");
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3 hours ago");
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe("2 days ago");
  });

  it("gives a short date after 30 days", () => {
    expect(relativeTime(ago(40 * 86_400_000), NOW)).toBe("16 Oct 2026");
  });

  it("does not show a future time as a negative age", () => {
    expect(relativeTime(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe("now");
  });

  it("returns an empty string for an unreadable date", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});
