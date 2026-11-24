import { z } from "zod";

import { isHttpsLink } from "@/lib/mentorship/time";

/** Postgres numbering: 0 is Sunday. Rules are in Bangladesh time. */
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DURATIONS = ["15", "20", "30"] as const;

/** Every half hour of the day: "00:00", "00:30", … "23:30". */
export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, "0");
  return `${hours}:${i % 2 === 0 ? "00" : "30"}`;
});

export const idSchema = z.uuid();
const idField = z.uuid({ error: "Something went wrong. Reload the page and try again." });

const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

const timeOfDay = z
  .string({ error: "Choose a time." })
  .regex(/^([01]\d|2[0-3]):(00|30)$/, { error: "Use a time on the hour or half hour." });

const blankToNull = (value: string | null | undefined) => value || null;

/** One weekly availability window. */
export const ruleSchema = z
  .object({
    weekday: z
      .string({ error: "Choose a day." })
      .regex(/^[0-6]$/, { error: "Choose a day." })
      .transform(Number),
    startTime: timeOfDay,
    endTime: timeOfDay,
  })
  .superRefine((rule, ctx) => {
    if (rule.startTime >= rule.endTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "The end must be after the start.",
      });
    } else if (minutes(rule.endTime) - minutes(rule.startTime) > 480) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "A window can be at most 8 hours.",
      });
    }
  })
  .transform((rule) => ({
    weekday: rule.weekday,
    start_time: rule.startTime,
    end_time: rule.endTime,
  }));

/** The mentor's own profile settings. */
export const mentorProfileSchema = z
  .object({
    expertiseAreas: z
      .string()
      .trim()
      .nullish()
      .transform((value) =>
        (value ?? "")
          .split(",")
          .map((area) => area.trim())
          .filter(Boolean),
      )
      .pipe(
        z
          .array(z.string().max(40, { error: "Each area must be 40 characters or fewer." }))
          .max(8, { error: "List at most 8 areas." }),
      ),
    bio: z
      .string()
      .trim()
      .max(500, { error: "Use 500 characters or fewer." })
      .nullish()
      .transform(blankToNull),
    maxSessions: z
      .string({ error: "Choose a number from 1 to 10." })
      .regex(/^(10|[1-9])$/, { error: "Choose a number from 1 to 10." })
      .transform(Number),
    accepting: z
      .string()
      .nullish()
      .transform((value) => value === "on"),
  })
  .transform((profile) => ({
    expertise_areas: [...new Set(profile.expertiseAreas)],
    bio: profile.bio,
    max_sessions_per_week: profile.maxSessions,
    accepting_requests: profile.accepting,
  }));

const optionalQuestion = z
  .string()
  .trim()
  .max(300, { error: "Use 300 characters or fewer." })
  .nullish()
  .transform(blankToNull)
  .refine((value) => value === null || value.length >= 5, {
    error: "Make the question at least 5 characters, or leave it empty.",
  });

/** A mentee's request for a slot. */
export const requestSchema = z
  .object({
    slotId: idField,
    duration: z.enum(DURATIONS, { error: "Choose 15, 20 or 30 minutes." }),
    goal: z
      .string({ error: "Say what you want from the session." })
      .trim()
      .min(10, { error: "Use at least 10 characters." })
      .max(500, { error: "Use 500 characters or fewer." }),
    question1: z
      .string({ error: "Ask at least one question." })
      .trim()
      .min(5, { error: "Use at least 5 characters." })
      .max(300, { error: "Use 300 characters or fewer." }),
    question2: optionalQuestion,
  })
  .transform((request) => ({
    slot_id: request.slotId,
    duration_minutes: Number(request.duration),
    goal: request.goal,
    question_1: request.question1,
    question_2: request.question2,
  }));

/** A mentor's answer: accept with a meeting link, or decline. */
export const respondSchema = z
  .object({
    requestId: idField,
    decision: z.enum(["accept", "decline"], { error: "Choose accept or decline." }),
    meetingUrl: z.string().trim().nullish().transform(blankToNull),
  })
  .superRefine((answer, ctx) => {
    if (
      answer.decision === "accept" &&
      !(answer.meetingUrl && isHttpsLink(answer.meetingUrl))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["meetingUrl"],
        message: "Add a meeting link that starts with https://",
      });
    }
  });

/** The mentor closes a finished session. */
export const outcomeSchema = z.object({
  sessionId: idField,
  outcome: z.enum(["completed", "no_show"]),
});

/** One person's rating of a completed session. */
export const feedbackSchema = z
  .object({
    sessionId: idField,
    rating: z
      .string({ error: "Choose a rating from 1 to 5." })
      .regex(/^[1-5]$/, { error: "Choose a rating from 1 to 5." })
      .transform(Number),
    comment: z
      .string()
      .trim()
      .max(500, { error: "Use 500 characters or fewer." })
      .nullish()
      .transform(blankToNull),
  })
  .transform((feedback) => ({
    session_id: feedback.sessionId,
    rating: feedback.rating,
    comment: feedback.comment,
  }));
