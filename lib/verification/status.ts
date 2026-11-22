import type { Enums } from "@/types/database.types";

export type VerificationStatus = Enums<"verification_status">;

/** The path every member walks, in order. */
export const VERIFICATION_STEPS = [
  "Account created",
  "Email confirmed",
  "IIUC affiliation verified",
] as const;

type StatusCopy = {
  /** Shown as the page heading. */
  headline: string;
  /** Shown beside the step the member is on now. */
  detail: string;
  /** How many of VERIFICATION_STEPS are complete. */
  stepsDone: number;
  /** What the member can do next, when there is something to do. */
  action?: { href: string; label: string };
};

/**
 * Wording for each verification status. Typed as a full Record so adding a
 * status to the database enum fails the type check until it has wording here.
 */
export const VERIFICATION_COPY: Record<VerificationStatus, StatusCopy> = {
  unverified: {
    headline: "Confirm your email to continue",
    detail: "Open the link we emailed you when you signed up.",
    stepsDone: 1,
  },
  email_verified: {
    headline: "Your email is confirmed",
    detail:
      "Next we check that you are an IIUC student or graduate. Send your details and a photo of your student ID card or certificate.",
    stepsDone: 2,
    action: { href: "/verify", label: "Verify my IIUC affiliation" },
  },
  affiliation_pending: {
    headline: "Your affiliation is being reviewed",
    detail: "An admin is checking the details you submitted.",
    stepsDone: 2,
    action: { href: "/verify", label: "View my request" },
  },
  verified_student: {
    headline: "You are a verified IIUC student",
    detail: "",
    stepsDone: 3,
  },
  verified_alumni: {
    headline: "You are a verified IIUC graduate",
    detail: "",
    stepsDone: 3,
  },
  trusted_member: {
    headline: "You are a verified, trusted member",
    detail: "",
    stepsDone: 3,
  },
};
