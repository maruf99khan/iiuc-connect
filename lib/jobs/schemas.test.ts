import { describe, expect, it } from "vitest";

import {
  JOB_TYPES,
  applySchema,
  decisionSchema,
  jobSchema,
} from "@/lib/jobs/schemas";

const id = "11111111-1111-4111-8111-111111111111";

describe("jobSchema", () => {
  const valid = {
    title: "  Backend Engineer ",
    company: " Acme ",
    location: " Dhaka ",
    jobType: "full_time",
    description: "  Build and run our payment services.  ",
  };

  it("trims and returns database columns", () => {
    expect(jobSchema.parse(valid)).toEqual({
      title: "Backend Engineer",
      company: "Acme",
      location: "Dhaka",
      job_type: "full_time",
      description: "Build and run our payment services.",
    });
  });

  it("turns a blank or missing location into null", () => {
    expect(jobSchema.parse({ ...valid, location: "  " }).location).toBeNull();
    expect(jobSchema.parse({ ...valid, location: null }).location).toBeNull();
  });

  it.each([
    { title: "Hi" },
    { title: "x".repeat(121) },
    { company: "  " },
    { company: "x".repeat(121) },
    { location: "x".repeat(121) },
    { jobType: "volunteer" },
    { jobType: "" },
    { description: "Too short" },
    { description: "x".repeat(3001) },
  ])("rejects %j", (patch) => {
    expect(jobSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("accepts every listed job type", () => {
    for (const jobType of JOB_TYPES) {
      expect(jobSchema.safeParse({ ...valid, jobType }).success).toBe(true);
    }
  });
});

describe("applySchema", () => {
  it("returns database columns and a null blank message", () => {
    expect(applySchema.parse({ jobId: id, message: " Hello " })).toEqual({
      job_id: id,
      message: "Hello",
    });
    expect(applySchema.parse({ jobId: id, message: "   " }).message).toBeNull();
    expect(applySchema.parse({ jobId: id, message: null }).message).toBeNull();
  });

  it("rejects a bad id and a message over 1000 characters", () => {
    expect(applySchema.safeParse({ jobId: "nope", message: null }).success).toBe(false);
    expect(
      applySchema.safeParse({ jobId: id, message: "x".repeat(1001) }).success,
    ).toBe(false);
  });
});

describe("decisionSchema", () => {
  it("accepts shortlisted and rejected only", () => {
    expect(decisionSchema.safeParse({ applicationId: id, decision: "shortlisted" }).success).toBe(true);
    expect(decisionSchema.safeParse({ applicationId: id, decision: "rejected" }).success).toBe(true);
    expect(decisionSchema.safeParse({ applicationId: id, decision: "withdrawn" }).success).toBe(false);
    expect(decisionSchema.safeParse({ applicationId: "x", decision: "rejected" }).success).toBe(false);
  });
});
