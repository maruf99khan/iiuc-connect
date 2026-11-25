/** Shared by the recovery forms and the server actions behind them. */
export type RecoveryFormState = {
  status: "idle" | "error" | "done";
  /** A problem with the whole form. */
  message?: string;
  fieldErrors?: { email?: string[]; password?: string[]; confirm?: string[] };
  /** The email as typed, so it survives a failed attempt. */
  email?: string;
};
