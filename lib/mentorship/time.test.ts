import { describe, expect, it } from "vitest";

import { formatDhaka, isHttpsLink } from "@/lib/mentorship/time";

describe("formatDhaka", () => {
  it("shows the day and time in Bangladesh time", () => {
    expect(formatDhaka("2026-12-01T09:30:00.000Z")).toMatch(
      /Tue.*1 Dec.*3:30\s?pm/i,
    );
  });

  it("rolls over to the next local day", () => {
    expect(formatDhaka("2026-11-30T20:15:00.000Z")).toMatch(
      /Tue.*1 Dec.*2:15\s?am/i,
    );
  });
});

describe("isHttpsLink", () => {
  it("accepts an https link", () => {
    expect(isHttpsLink("https://meet.example.com/abc-def")).toBe(true);
  });

  it.each([
    "http://meet.example.com/abc",
    "ftp://meet.example.com/abc",
    "javascript:alert(1)",
    "meet.example.com/abc",
    "https://",
    "https://meet.example.com/a b",
    `https://meet.example.com/${"a".repeat(300)}`,
    "https://user:pass@meet.example.com/abc",
    "",
  ])("rejects %j", (value) => {
    expect(isHttpsLink(value)).toBe(false);
  });
});
