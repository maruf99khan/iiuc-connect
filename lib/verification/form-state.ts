/** Shared by the claim form and the server actions behind it. */
export type ClaimField =
  | "fullName"
  | "affiliation"
  | "studentId"
  | "department"
  | "batch"
  | "graduationYear"
  | "documentKind"
  | "document";

export type ClaimFormState = {
  status: "idle" | "error";
  /** A problem with the whole form rather than one field. */
  message?: string;
  fieldErrors?: Partial<Record<ClaimField, string[]>>;
  /** What the member typed, so a failed attempt does not wipe the form. */
  values?: Partial<Record<Exclude<ClaimField, "document">, string>>;
};

export type DecisionFormState = {
  status: "idle" | "error";
  message?: string;
};
