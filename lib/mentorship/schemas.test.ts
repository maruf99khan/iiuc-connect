import { describe, expect, it } from "vitest";

import {
  TIME_OPTIONS,
  feedbackSchema,
  mentorProfileSchema,
  outcomeSchema,
  requestSchema,
  respondSchema,
  ruleSchema,
} from "@/lib/mentorship/schemas";

const id = "11111111-1111-4111-8111-111111111111";

describe("TIME_OPTIONS", () => {
  it("lists every half hour of the day", () => {
    expect(TIME_OPTIONS).toHaveLength(48);
    expect(TIME_OPTIONS[0]).toBe("00:00");
    expect(TIME_OPTIONS[19]).toBe("09:30");
    expect(TIME_OPTIONS[47]).toBe("23:30");
  });
});

describe("ruleSchema", () => {
  it("accepts a weekday window and returns database columns", () => {
    expect(
      ruleSchema.parse({ weekday: "2", startTime: "09:00", endTime: "11:30" }),
    ).toEqual({ weekday: 2, start_time: "09:00", end_time: "11:30" });
  });

  it.each([
    [{ weekday: "7", startTime: "09:00", endTime: "10:00" }],
    [{ weekday: "-1", startTime: "09:00", endTime: "10:00" }],
    [{ weekday: "1", startTime: "09:15", endTime: "10:00" }],
    [{ weekday: "1", startTime: "10:00", endTime: "09:00" }],
    [{ weekday: "1", startTime: "10:00", endTime: "10:00" }],
    [{ weekday: "1", startTime: "08:00", endTime: "17:00" }],
    [{ weekday: null, startTime: null, endTime: null }],
  ])("rejects %j", (input) => {
    expect(ruleSchema.safeParse(input).success).toBe(false);
  });

  it("accepts exactly 8 hours", () => {
    expect(
      ruleSchema.safeParse({ weekday: "1", startTime: "08:00", endTime: "16:00" })
        .success,
    ).toBe(true);
  });
});

describe("mentorProfileSchema", () => {
  const valid = {
    expertiseAreas: " backend, SQL ,backend ",
    bio: "  Ten years in fintech.  ",
    maxSessions: "3",
    accepting: "on",
  };

  it("splits, trims and de-duplicates areas", () => {
    expect(mentorProfileSchema.parse(valid)).toEqual({
      expertise_areas: ["backend", "SQL"],
      bio: "Ten years in fintech.",
      max_sessions_per_week: 3,
      accepting_requests: true,
    });
  });

  it("treats a missing checkbox as not accepting, and a blank bio as null", () => {
    const parsed = mentorProfileSchema.parse({
      ...valid,
      bio: "  ",
      accepting: null,
    });
    expect(parsed.accepting_requests).toBe(false);
    expect(parsed.bio).toBeNull();
  });

  it.each(["0", "11", "abc", "", "2.5"])("rejects a weekly cap of %j", (maxSessions) => {
    expect(mentorProfileSchema.safeParse({ ...valid, maxSessions }).success).toBe(false);
  });

  it("rejects more than 8 areas and areas over 40 characters", () => {
    expect(
      mentorProfileSchema.safeParse({ ...valid, expertiseAreas: "a,b,c,d,e,f,g,h,i" }).success,
    ).toBe(false);
    expect(
      mentorProfileSchema.safeParse({ ...valid, expertiseAreas: "x".repeat(41) }).success,
    ).toBe(false);
  });

  it("rejects a bio over 500 characters", () => {
    expect(mentorProfileSchema.safeParse({ ...valid, bio: "x".repeat(501) }).success).toBe(false);
  });
});

describe("requestSchema", () => {
  const valid = {
    slotId: id,
    duration: "20",
    goal: "  Learn how to land a backend job  ",
    question1: "What should I build first?",
    question2: null,
  };

  it("returns database columns and a null second question", () => {
    expect(requestSchema.parse(valid)).toEqual({
      slot_id: id,
      duration_minutes: 20,
      goal: "Learn how to land a backend job",
      question_1: "What should I build first?",
      question_2: null,
    });
  });

  it("keeps a real second question and drops a blank one", () => {
    expect(requestSchema.parse({ ...valid, question2: " Any tips? " }).question_2).toBe("Any tips?");
    expect(requestSchema.parse({ ...valid, question2: "   " }).question_2).toBeNull();
  });

  it.each([
    { slotId: "nope" },
    { duration: "45" },
    { duration: "" },
    { goal: "short" },
    { goal: "x".repeat(501) },
    { question1: "hi" },
    { question1: "x".repeat(301) },
    { question2: "no" },
  ])("rejects %j", (patch) => {
    expect(requestSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("respondSchema", () => {
  it("accepts an accept with an https link", () => {
    expect(
      respondSchema.parse({ requestId: id, decision: "accept", meetingUrl: " https://meet.example/x " }),
    ).toEqual({ requestId: id, decision: "accept", meetingUrl: "https://meet.example/x" });
  });

  it("accepts a decline without a link", () => {
    expect(
      respondSchema.safeParse({ requestId: id, decision: "decline", meetingUrl: null }).success,
    ).toBe(true);
  });

  it.each([null, "", "http://meet.example/x", "meet.example/x"])(
    "rejects accepting with the link %j",
    (meetingUrl) => {
      expect(
        respondSchema.safeParse({ requestId: id, decision: "accept", meetingUrl }).success,
      ).toBe(false);
    },
  );

  it("rejects an unknown decision", () => {
    expect(
      respondSchema.safeParse({ requestId: id, decision: "maybe", meetingUrl: null }).success,
    ).toBe(false);
  });
});

describe("outcomeSchema", () => {
  it("accepts completed and no_show only", () => {
    expect(outcomeSchema.safeParse({ sessionId: id, outcome: "completed" }).success).toBe(true);
    expect(outcomeSchema.safeParse({ sessionId: id, outcome: "no_show" }).success).toBe(true);
    expect(outcomeSchema.safeParse({ sessionId: id, outcome: "cancelled" }).success).toBe(false);
  });
});

describe("feedbackSchema", () => {
  it("returns database columns", () => {
    expect(feedbackSchema.parse({ sessionId: id, rating: "5", comment: " Great " })).toEqual({
      session_id: id,
      rating: 5,
      comment: "Great",
    });
  });

  it("turns a blank comment into null", () => {
    expect(feedbackSchema.parse({ sessionId: id, rating: "3", comment: null }).comment).toBeNull();
  });

  it.each(["0", "6", "x", "", null])("rejects a rating of %j", (rating) => {
    expect(feedbackSchema.safeParse({ sessionId: id, rating, comment: null }).success).toBe(false);
  });

  it("rejects a comment over 500 characters", () => {
    expect(
      feedbackSchema.safeParse({ sessionId: id, rating: "4", comment: "x".repeat(501) }).success,
    ).toBe(false);
  });
});
