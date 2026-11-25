import { z } from "zod";

export const JOB_TYPES = ["full_time", "part_time", "internship", "contract"] as const;

export const JOB_TYPE_LABEL: Record<(typeof JOB_TYPES)[number], string> = {
  full_time: "Full time",
  part_time: "Part time",
  internship: "Internship",
  contract: "Contract",
};

const idField = z.uuid({ error: "Something went wrong. Reload the page and try again." });
const blankToNull = (value: string | null | undefined) => value || null;

/** A graduate's job post. */
export const jobSchema = z
  .object({
    title: z
      .string({ error: "Give the job a title." })
      .trim()
      .min(3, { error: "Use at least 3 characters." })
      .max(120, { error: "Use 120 characters or fewer." }),
    company: z
      .string({ error: "Say which company." })
      .trim()
      .min(1, { error: "Say which company." })
      .max(120, { error: "Use 120 characters or fewer." }),
    location: z
      .string()
      .trim()
      .max(120, { error: "Use 120 characters or fewer." })
      .nullish()
      .transform(blankToNull),
    jobType: z.enum(JOB_TYPES, { error: "Choose a job type." }),
    description: z
      .string({ error: "Describe the job." })
      .trim()
      .min(20, { error: "Use at least 20 characters." })
      .max(3000, { error: "Use 3000 characters or fewer." }),
  })
  .transform((job) => ({
    title: job.title,
    company: job.company,
    location: job.location,
    job_type: job.jobType,
    description: job.description,
  }));

/** A member's application, with an optional message. */
export const applySchema = z
  .object({
    jobId: idField,
    message: z
      .string()
      .trim()
      .max(1000, { error: "Use 1000 characters or fewer." })
      .nullish()
      .transform(blankToNull),
  })
  .transform((application) => ({
    job_id: application.jobId,
    message: application.message,
  }));

/** The poster's answer to an application. */
export const decisionSchema = z.object({
  applicationId: idField,
  decision: z.enum(["shortlisted", "rejected"]),
});
