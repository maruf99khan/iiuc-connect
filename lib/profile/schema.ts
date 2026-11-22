import { z } from "zod";

/** Same bound as the database constraint on profiles.skills. */
export const MAX_SKILLS = 30;
export const SKILL_MAX_LENGTH = 40;

export const VISIBILITY_OPTIONS = [
  "public",
  "iiuc_community",
  "private",
] as const;

export const VISIBILITY_LABELS: Record<
  (typeof VISIBILITY_OPTIONS)[number],
  { title: string; detail: string }
> = {
  iiuc_community: {
    title: "Verified IIUC members",
    detail: "Only members whose affiliation is verified can find you.",
  },
  public: {
    title: "Anyone signed in",
    detail: "Any signed-in member can find you, verified or not.",
  },
  private: {
    title: "Only me",
    detail: "You will not appear in the directory.",
  },
};

/** "python, react; go" → ["python", "react", "go"], without duplicates. */
export function parseSkills(input: string | null | undefined): string[] {
  if (!input) return [];

  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of input.split(/[,;\n]/)) {
    const skill = raw.replace(/\s+/g, " ").trim();
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
  }
  return skills;
}

/** A blank field is stored as null, not as an empty string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Use ${max} characters or fewer.` })
    .nullish()
    .transform((value) => value || null);

/**
 * Only a real LinkedIn address over https: the host must be linkedin.com or a
 * subdomain of it, with no embedded credentials or port. A look-alike such as
 * linkedin.com.evil.example or https://linkedin.com@evil.example/ is refused.
 */
function isLinkedInUrl(value: string): boolean {
  if (value.length > 300) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"))
    );
  } catch {
    return false;
  }
}

export const fullNameSchema = z
  .string({ error: "Enter your full name." })
  .trim()
  .min(2, { error: "Enter your full name." })
  .max(120, { error: "Use 120 characters or fewer." });

/** The editable part of a profile, returned with database column names. */
export const profileSchema = z
  .object({
    headline: optionalText(160),
    bio: optionalText(2000),
    jobTitle: optionalText(120),
    company: optionalText(120),
    location: optionalText(120),
    industry: optionalText(80),
    skills: z
      .string()
      .nullish()
      .transform(parseSkills)
      .refine((skills) => skills.length <= MAX_SKILLS, {
        error: `List at most ${MAX_SKILLS} skills.`,
      })
      .refine((skills) => skills.every((s) => s.length <= SKILL_MAX_LENGTH), {
        error: `Keep each skill to ${SKILL_MAX_LENGTH} characters or fewer.`,
      }),
    linkedinUrl: z
      .string()
      .trim()
      .nullish()
      .transform((value) => value || null)
      .refine((value) => value === null || isLinkedInUrl(value), {
        error: "Use your LinkedIn address, starting with https://linkedin.com/",
      }),
    visibility: z.enum(VISIBILITY_OPTIONS, {
      error: "Choose who can see your profile.",
    }),
  })
  .transform((profile) => ({
    headline: profile.headline,
    bio: profile.bio,
    job_title: profile.jobTitle,
    company: profile.company,
    location: profile.location,
    industry: profile.industry,
    skills: profile.skills,
    linkedin_url: profile.linkedinUrl,
    visibility: profile.visibility,
  }));

export type ProfileUpdate = z.output<typeof profileSchema>;
