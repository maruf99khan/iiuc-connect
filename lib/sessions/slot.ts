import { z } from "zod";

/** Same limits as the database (migration 007). */
export const MIN_MINUTES_AHEAD = 30;
export const MAX_DAYS_AHEAD = 60;

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, no daylight saving

/**
 * Reads a datetime-local value ("2026-12-01T15:30") as Bangladesh time and
 * returns the instant, or null when it is not a real date and time. Dates that
 * would roll over (30 February, 25:00) are refused, not corrected.
 */
export function parseDhakaLocal(input: unknown): Date | null {
  if (typeof input !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input);
  if (!match) return null;

  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    asUtc.getUTCFullYear() !== year ||
    asUtc.getUTCMonth() !== month - 1 ||
    asUtc.getUTCDate() !== day ||
    asUtc.getUTCHours() !== hour ||
    asUtc.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return new Date(asUtc.getTime() - DHAKA_OFFSET_MS);
}

/** "Tue 1 Dec, 3:30 pm" in Bangladesh time, whatever the server's own zone. */
export function formatDhaka(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Dhaka",
  });
}

function isHttpsLink(value: string): boolean {
  if (value.length > 300 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/** What a mentor enters to offer a slot, returned with database column names. */
export const slotSchema = z
  .object({
    startsAt: z.string({ error: "Choose a date and time." }),
    duration: z.enum(["15", "30"], { error: "Choose 15 or 30 minutes." }),
    topic: z
      .string({ error: "Say what you can help with." })
      .trim()
      .min(2, { error: "Say what you can help with." })
      .max(120, { error: "Use 120 characters or fewer." }),
    meetingUrl: z
      .string({ error: "Add the meeting link." })
      .trim()
      .refine(isHttpsLink, {
        error: "Use a meeting link that starts with https://",
      }),
  })
  .superRefine((slot, ctx) => {
    const start = parseDhakaLocal(slot.startsAt);
    if (!start) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "Enter a valid date and time.",
      });
      return;
    }

    const now = Date.now();
    if (start.getTime() < now + MIN_MINUTES_AHEAD * 60_000) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: `Choose a time at least ${MIN_MINUTES_AHEAD} minutes from now.`,
      });
    } else if (start.getTime() > now + MAX_DAYS_AHEAD * 86_400_000) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: `Choose a time within the next ${MAX_DAYS_AHEAD} days.`,
      });
    }
  })
  .transform((slot) => ({
    starts_at: (parseDhakaLocal(slot.startsAt) as Date).toISOString(),
    duration_minutes: Number(slot.duration),
    topic: slot.topic,
    meeting_url: slot.meetingUrl,
  }));

/** The optional message a member sends when booking. */
export const bookingNoteSchema = z
  .string()
  .trim()
  .max(500, { error: "Use 500 characters or fewer." })
  .nullish()
  .transform((note) => note || null);
