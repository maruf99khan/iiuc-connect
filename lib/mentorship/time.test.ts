import { describe, expect, it } from "vitest";

import { bookableAfter, formatDhaka, isHttpsLink } from "@/lib/mentorship/time";

describe("bookableAfter", () => {
  // The database rejects a slot starting less than 30 minutes from now
  // (private.requests_before_insert), so the screens must not offer one.
  it("is later than the database's 30 minute limit, with a small margin", () => {
    const now = new Date("2026-11-26T06:00:00.000Z");
    expect(bookableAfter(now)).toBe("2026-11-26T06:31:00.000Z");
  });
});

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
