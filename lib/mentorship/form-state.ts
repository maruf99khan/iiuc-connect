/** Shared by the mentorship forms and the server actions behind them. */
export type MentorshipField =
  | "weekday"
  | "startTime"
  | "endTime"
  | "expertiseAreas"
  | "bio"
  | "maxSessions"
  | "accepting"
  | "slotId"
  | "duration"
  | "goal"
  | "question1"
  | "question2"
  | "requestId"
  | "decision"
  | "meetingUrl"
  | "sessionId"
  | "rating"
  | "comment";

export type MentorshipFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<MentorshipField, string[]>>;
  /** What the member typed, so a failed attempt does not wipe the form. */
  values?: Partial<Record<MentorshipField, string>>;
};
