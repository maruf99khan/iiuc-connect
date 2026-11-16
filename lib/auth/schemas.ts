import { z } from "zod";

/** Where a member lands after signing in when no destination was requested. */
export const DEFAULT_SIGNED_IN_PATH = "/dashboard";

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }).max(254));

export const signUpSchema = z.object({
  email,
  // Not trimmed: spaces are legitimate password characters.
  // 72 is the longest password bcrypt (used by Supabase Auth) can hash.
  password: z
    .string({ error: "Choose a password." })
    .min(8, { error: "Use at least 8 characters." })
    .max(72, { error: "Use 72 characters or fewer." }),
});

/**
 * Sign-in only checks that a password was typed. Length rules belong to
 * sign-up; applying them here would lock out accounts made under older rules.
 */
export const signInSchema = z.object({
  email,
  password: z
    .string({ error: "Enter your password." })
    .min(1, { error: "Enter your password." })
    .max(72, { error: "Use 72 characters or fewer." }),
});

/** The `type` values Supabase puts in the links it emails. */
export const emailOtpTypeSchema = z.enum([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

// Browsers drop tabs and newlines inside URLs, so "/\t/evil.example" would
// be followed as "//evil.example".
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Returns `next` only when it is a path on this site. Anything that could
 * send the browser to another origin falls back to the default, which stops
 * a crafted sign-in link from redirecting a member to a look-alike site.
 */
export function safeNextPath(next: unknown): string {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    CONTROL_CHARACTERS.test(next)
  ) {
    return DEFAULT_SIGNED_IN_PATH;
  }

  return next;
}
