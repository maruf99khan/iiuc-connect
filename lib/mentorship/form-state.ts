/** Shared by the session forms and the server actions behind them. */
export type SessionField =
  | "startsAt"
  | "duration"
  | "topic"
  | "meetingUrl"
  | "note";

export type SessionFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<SessionField, string[]>>;
  /** What the member typed, so a failed attempt does not wipe the form. */
  values?: Partial<Record<SessionField, string>>;
};
