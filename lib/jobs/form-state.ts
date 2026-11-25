/** Shared by the jobs forms and the server actions behind them. */
export type JobField =
  | "title"
  | "company"
  | "location"
  | "jobType"
  | "description"
  | "jobId"
  | "message"
  | "cv";

export type JobFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<JobField, string[]>>;
  /** What the member typed, so a failed attempt does not wipe the form. */
  values?: Partial<Record<JobField, string>>;
};
