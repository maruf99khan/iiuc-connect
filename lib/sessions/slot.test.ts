import { describe, expect, it } from "vitest";

import {
  MAX_DAYS_AHEAD,
  MIN_MINUTES_AHEAD,
  bookingNoteSchema,
  formatDhaka,
  parseDhakaLocal,
  slotSchema,
} from "@/lib/sessions/slot";

describe("parseDhakaLocal", () => {
  it("reads a datetime-local value as Bangladesh time (UTC+6)", () => {
    expect(parseDhakaLocal("2026-12-01T15:30")?.toISOString()).toBe(
      "2026-12-01T09:30:00.000Z",
    );
  });

  it("handles a time that falls on the previous UTC day", () => {
    expect(parseDhakaLocal("2026-12-01T02:15")?.toISOString()).toBe(
      "2026-11-30T20:15:00.000Z",
    );
  });

  it.each([
    "",
    "2026-12-01",
    "2026-12-01 15:30",
    "2026-13-01T15:30",
    "2026-02-30T15:30",
    "2026-12-01T25:00",
    "2026-12-01T15:60",
    "tomorrow",
    "2026-12-01T15:30:00Z",
  ])("rejects %j", (input) => {
    expect(parseDhakaLocal(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parseDhakaLocal(null)).toBeNull();
    expect(parseDhakaLocal(undefined)).toBeNull();
    expect(parseDhakaLocal(["2026-12-01T15:30"])).toBeNull();
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

const futureLocal = (minutes: number) => {
  // A datetime-local string in Dhaka time, `minutes` from now.
  const d = new Date(Date.now() + minutes * 60_000 + 6 * 3_600_000);
  return d.toISOString().slice(0, 16);
};

const valid = {
  startsAt: futureLocal(2 * 24 * 60),
  duration: "30",
  topic: "  Breaking into backend  ",
  meetingUrl: "https://meet.example.com/abc-def",
};

describe("slotSchema", () => {
  it("accepts a slot and returns database-shaped values", () => {
    const parsed = slotSchema.parse(valid);
    expect(parsed.duration_minutes).toBe(30);
    expect(parsed.topic).toBe("Breaking into backend");
    expect(parsed.meeting_url).toBe("https://meet.example.com/abc-def");
    expect(parsed.starts_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("accepts 15 minutes", () => {
    expect(slotSchema.safeParse({ ...valid, duration: "15" }).success).toBe(
      true,
    );
  });

  it.each(["20", "0", "45", "abc", ""])(
    "rejects a duration of %j",
    (duration) => {
      expect(slotSchema.safeParse({ ...valid, duration }).success).toBe(false);
    },
  );

  it("rejects a slot that is too soon or too far away", () => {
    expect(
      slotSchema.safeParse({
        ...valid,
        startsAt: futureLocal(MIN_MINUTES_AHEAD - 5),
      }).success,
    ).toBe(false);
    expect(
      slotSchema.safeParse({ ...valid, startsAt: futureLocal(-60) }).success,
    ).toBe(false);
    expect(
      slotSchema.safeParse({
        ...valid,
        startsAt: futureLocal((MAX_DAYS_AHEAD + 1) * 24 * 60),
      }).success,
    ).toBe(false);
  });

  it("accepts a slot just inside both limits", () => {
    expect(
      slotSchema.safeParse({
        ...valid,
        startsAt: futureLocal(MIN_MINUTES_AHEAD + 5),
      }).success,
    ).toBe(true);
    expect(
      slotSchema.safeParse({
        ...valid,
        startsAt: futureLocal((MAX_DAYS_AHEAD - 1) * 24 * 60),
      }).success,
    ).toBe(true);
  });

  it.each(["", "a", "x".repeat(121)])("rejects the topic %j", (topic) => {
    expect(slotSchema.safeParse({ ...valid, topic }).success).toBe(false);
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
  ])("rejects the meeting link %j", (meetingUrl) => {
    expect(slotSchema.safeParse({ ...valid, meetingUrl }).success).toBe(false);
  });

  it("rejects missing fields without throwing", () => {
    expect(slotSchema.safeParse({}).success).toBe(false);
  });
});

describe("bookingNoteSchema", () => {
  it("turns a blank note into null and trims the rest", () => {
    expect(bookingNoteSchema.parse("  ")).toBeNull();
    expect(bookingNoteSchema.parse(null)).toBeNull();
    expect(bookingNoteSchema.parse("  Hello  ")).toBe("Hello");
  });

  it("rejects a note over 500 characters", () => {
    expect(bookingNoteSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});
