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
  // Matches the database rules: a verified member with this setting can be read
  // by visitors who are not signed in, so say so plainly.
  public: {
    title: "Everyone, even visitors who are not signed in",
    detail:
      "Your name, headline and work details become publicly readable. Choose this only if you are comfortable with that.",
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
export function isLinkedInUrl(value: string): boolean {
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

/** An https address with no spaces, credentials, or script scheme, at most 300 characters. */
function parseHttpsUrl(value: string): URL | null {
  if (value.length > 300 || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * A portfolio may be on any host, but only over https and with no embedded
 * credentials, so https://github.com@evil.example/ cannot pass as GitHub.
 * The database applies the same rules (profiles_portfolio_url_format).
 */
export function isPortfolioUrl(value: string): boolean {
  return parseHttpsUrl(value) !== null;
}

/** github.com or www.github.com only, with no credentials or port. */
export function isGithubUrl(value: string): boolean {
  const url = parseHttpsUrl(value);
  return (
    url !== null &&
    url.port === "" &&
    (url.hostname === "github.com" || url.hostname === "www.github.com")
  );
}

const optionalUrl = (check: (value: string) => boolean, error: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null)
    .refine((value) => value === null || check(value), { error });

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
    portfolioUrl: optionalUrl(
      isPortfolioUrl,
      "Use a full address starting with https://",
    ),
    githubUrl: optionalUrl(
      isGithubUrl,
      "Use your GitHub address, starting with https://github.com/",
    ),
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
    portfolio_url: profile.portfolioUrl,
    github_url: profile.githubUrl,
    visibility: profile.visibility,
  }));

export type ProfileUpdate = z.output<typeof profileSchema>;
