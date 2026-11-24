/** Shared by the profile form and the server action behind it. */
export type ProfileField =
  | "fullName"
  | "headline"
  | "bio"
  | "jobTitle"
  | "company"
  | "location"
  | "industry"
  | "skills"
  | "linkedinUrl"
  | "portfolioUrl"
  | "githubUrl"
  | "visibility";

export type ProfileFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ProfileField, string[]>>;
  /** What the member typed, so a failed save does not wipe the form. */
  values?: Partial<Record<ProfileField, string>>;
};
