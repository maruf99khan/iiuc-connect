import { describe, expect, it } from "vitest";

import {
  MAX_SKILLS,
  SKILL_MAX_LENGTH,
  parseSkills,
  profileSchema,
} from "@/lib/profile/schema";

const base = {
  headline: " Backend engineer ",
  bio: "I build APIs.",
  jobTitle: "Engineer",
  company: "Acme",
  location: "Chattogram",
  industry: "Software",
  skills: "Python, React",
  linkedinUrl: "https://www.linkedin.com/in/rahim",
  portfolioUrl: "https://rahim.dev/work",
  githubUrl: "https://github.com/rahim",
  visibility: "iiuc_community",
};

describe("parseSkills", () => {
  it("splits on commas, semicolons and new lines", () => {
    expect(parseSkills("python, react;go\nsql")).toEqual([
      "python",
      "react",
      "go",
      "sql",
    ]);
  });

  it("trims, collapses spaces and drops empty items", () => {
    expect(parseSkills("  machine   learning , , ,  ")).toEqual([
      "machine learning",
    ]);
  });

  it("removes duplicates without regard to case, keeping the first spelling", () => {
    expect(parseSkills("Python, python, PYTHON, React")).toEqual([
      "Python",
      "React",
    ]);
  });

  it.each([null, undefined, ""])("gives an empty list for %j", (input) => {
    expect(parseSkills(input)).toEqual([]);
  });
});

describe("profileSchema", () => {
  it("accepts a full profile and returns database-shaped values", () => {
    const parsed = profileSchema.parse(base);
    expect(parsed).toEqual({
      headline: "Backend engineer",
      bio: "I build APIs.",
      job_title: "Engineer",
      company: "Acme",
      location: "Chattogram",
      industry: "Software",
      skills: ["Python", "React"],
      linkedin_url: "https://www.linkedin.com/in/rahim",
      portfolio_url: "https://rahim.dev/work",
      github_url: "https://github.com/rahim",
      visibility: "iiuc_community",
    });
  });

  it("turns blank optional fields into null", () => {
    const parsed = profileSchema.parse({
      visibility: "private",
      headline: "  ",
      linkedinUrl: "",
    });
    expect(parsed.headline).toBeNull();
    expect(parsed.bio).toBeNull();
    expect(parsed.linkedin_url).toBeNull();
    expect(parsed.portfolio_url).toBeNull();
    expect(parsed.github_url).toBeNull();
    expect(parsed.skills).toEqual([]);
  });

  it("treats fields missing from the form (null) as blank", () => {
    const parsed = profileSchema.parse({
      visibility: "public",
      headline: null,
      skills: null,
      linkedinUrl: null,
    });
    expect(parsed.headline).toBeNull();
    expect(parsed.skills).toEqual([]);
  });

  it.each([
    ["headline", "x".repeat(161)],
    ["bio", "x".repeat(2001)],
    ["jobTitle", "x".repeat(121)],
    ["company", "x".repeat(121)],
    ["location", "x".repeat(121)],
    ["industry", "x".repeat(81)],
  ])("rejects a %s that is too long", (field, value) => {
    expect(profileSchema.safeParse({ ...base, [field]: value }).success).toBe(
      false,
    );
  });

  it("rejects more skills than the database allows", () => {
    const many = Array.from({ length: MAX_SKILLS + 1 }, (_, i) => `skill${i}`);
    expect(
      profileSchema.safeParse({ ...base, skills: many.join(",") }).success,
    ).toBe(false);
  });

  it("accepts exactly the maximum number of skills", () => {
    const many = Array.from({ length: MAX_SKILLS }, (_, i) => `skill${i}`);
    expect(
      profileSchema.safeParse({ ...base, skills: many.join(",") }).success,
    ).toBe(true);
  });

  it("rejects a skill that is too long", () => {
    const long = "x".repeat(SKILL_MAX_LENGTH + 1);
    expect(
      profileSchema.safeParse({ ...base, skills: `python, ${long}` }).success,
    ).toBe(false);
  });

  it.each([
    "https://linkedin.com/in/rahim",
    "https://bd.linkedin.com/in/rahim",
    "https://www.linkedin.com/company/acme/",
  ])("accepts the LinkedIn address %s", (linkedinUrl) => {
    expect(profileSchema.safeParse({ ...base, linkedinUrl }).success).toBe(true);
  });

  it.each([
    ["not https", "http://www.linkedin.com/in/rahim"],
    ["another site", "https://example.com/in/rahim"],
    ["a look-alike host", "https://linkedin.com.evil.example/in/rahim"],
    ["a look-alike prefix", "https://notlinkedin.com/in/rahim"],
    ["a script", "javascript:alert(1)"],
    ["not a URL", "linkedin.com/in/rahim"],
    ["a user-info trick", "https://linkedin.com@evil.example/"],
    ["too long", `https://www.linkedin.com/in/${"a".repeat(300)}`],
  ])("rejects a LinkedIn address that is %s", (_label, linkedinUrl) => {
    expect(profileSchema.safeParse({ ...base, linkedinUrl }).success).toBe(
      false,
    );
  });

  it.each([
    "https://rahim.dev",
    "https://rahim.dev/work?tab=2#top",
    "https://sub.example.com:8443/x",
    "https://github.com/rahim/portfolio",
  ])("accepts the portfolio address %s", (portfolioUrl) => {
    expect(profileSchema.safeParse({ ...base, portfolioUrl }).success).toBe(true);
  });

  it.each([
    ["not https", "http://rahim.dev"],
    ["a script", "javascript:alert(1)"],
    ["a data address", "data:text/html,<b>hi</b>"],
    ["no scheme", "rahim.dev"],
    ["a space in the host", "https://exa mple.com/x"],
    ["a user-info trick", "https://github.com@evil.example/"],
    ["credentials", "https://user:pass@example.com/"],
    ["too long", `https://example.com/${"a".repeat(300)}`],
  ])("rejects a portfolio address that is %s", (_label, portfolioUrl) => {
    expect(profileSchema.safeParse({ ...base, portfolioUrl }).success).toBe(false);
  });

  it.each([
    "https://github.com/rahim",
    "https://www.github.com/rahim",
    "https://github.com",
    "https://github.com/rahim?tab=repositories",
  ])("accepts the GitHub address %s", (githubUrl) => {
    expect(profileSchema.safeParse({ ...base, githubUrl }).success).toBe(true);
  });

  it.each([
    ["not https", "http://github.com/rahim"],
    ["another site", "https://gitlab.com/rahim"],
    ["a look-alike host", "https://github.com.evil.example/rahim"],
    ["a look-alike prefix", "https://notgithub.com/rahim"],
    ["a subdomain that is not www", "https://gist.github.com/rahim"],
    ["a user-info trick", "https://github.com@evil.example/"],
    ["a script", "javascript:alert(1)"],
  ])("rejects a GitHub address that is %s", (_label, githubUrl) => {
    expect(profileSchema.safeParse({ ...base, githubUrl }).success).toBe(false);
  });

  it("treats blank portfolio and GitHub fields as none", () => {
    const parsed = profileSchema.parse({ ...base, portfolioUrl: "  ", githubUrl: "" });
    expect(parsed.portfolio_url).toBeNull();
    expect(parsed.github_url).toBeNull();
  });

  it("rejects an unknown visibility", () => {
    expect(
      profileSchema.safeParse({ ...base, visibility: "everyone" }).success,
    ).toBe(false);
  });
});
